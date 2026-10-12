# Architecture

itinerary is a modular Next.js application backed by PostgreSQL. The same Node process serves HTTP and WebSockets. REST is the write boundary; the database owns durable state.

## Module boundaries

| Module                        | Responsibility                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/app`                     | React views, routing, request parsing, session resolution, and response mapping                    |
| `src/domain`                  | Framework-independent validation, permission policies, date ranges, and scheduling rules           |
| `src/server`                  | Application services, membership-scoped queries, transactions, authentication, and email delivery  |
| `src/infrastructure/realtime` | Socket upgrades, connection limits, heartbeats, authorization rechecks, and database notifications |
| `prisma`                      | Relational schema and reviewable SQL migrations                                                    |

Route handlers delegate business operations to services. Services use Prisma directly; a separate repository abstraction would currently add indirection without changing ownership or behavior. Domain policies are reusable, but the server must load membership before evaluating them.

## Why one application

A single application keeps cookies, development, builds, and deployment on one origin. A separate backend would add authentication coordination and a second deployment before independent scaling is needed.

Persistent WebSockets require a small custom Node server. `server.ts` uses Node 24's TypeScript support and starts Next.js alongside the gateway. This choice requires a long-running Node runtime and packaging the server source; deployment cannot assume Next.js standalone or serverless support. The gateway can be separated later if connection load warrants independent scaling.

## Relational model

| Entity                                   | Key relationships and constraints                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| User, Session, Account, Verification     | Better Auth identities, provider accounts, database sessions, and time-limited verification tokens     |
| Trip                                     | Creator attribution, IANA timezone, optional paired dates, independent detail/itinerary revisions      |
| TripMember                               | Composite trip/user primary key and database-enforced maximum of one owner per trip                    |
| TripInvitation, TripReadLink             | Email-bound invitations and expiring read-only links; read-link tokens are stored as hashes            |
| Bookmark, Collection, BookmarkCollection | Trip-scoped ideas, optional URLs/notes, many-to-many collection membership with composite foreign keys |
| ItineraryDay, ItineraryItem              | Unique trip/date pairs; activities have explicit nonnegative positions and optional scheduled instants |
| Comment, Vote                            | Foreign-key-backed bookmark/activity targets with single-target checks; one vote per user and target   |
| ActivityLog                              | Transactional group history retaining small title snapshots after target deletion                      |

Legacy Place/SavedPlace models remain to preserve existing data and relationships. The current bookmark workflow does not depend on a map provider or place lookup API.

Trip deletion cascades through trip-owned data. Removing a collection preserves its bookmarks; removing a bookmark preserves scheduled activities by clearing their source reference. Comment/vote targets enforce trip identity in their foreign keys, preventing cross-trip references. Deleting a target removes its discussion; activity history retains a short record. Shared users are not deleted with a trip.

SQL migrations include checks, partial indexes, and notification triggers beyond what Prisma's schema can express. Ownership creation/transfer and itinerary ordering use transactions and trip-row locking. Bookmark relation reads are sequential bulk queries for the current page, within a repeatable-read snapshot; they avoid per-record queries and the PostgreSQL driver's deprecated implicit query queue.

## Authentication and authorization

Better Auth provides email/password verification and recovery, optional Google OAuth, and database-backed sessions in cookies. Secrets come from the environment. Automatic provider-account linking is disabled. Password reset revokes existing sessions. Authentication establishes identity; trip membership controls access.

| Action                                                         | Owner | Editor | Viewer |
| -------------------------------------------------------------- | ----- | ------ | ------ |
| Read trip content                                              | Yes   | Yes    | Yes    |
| Edit trip details, bookmarks, and itinerary                    | Yes   | Yes    | No     |
| Invite members/create read-only links                          | Yes   | Yes    | No     |
| Comment and vote                                               | Yes   | Yes    | No     |
| Change roles, remove members, revoke links, transfer ownership | Yes   | No     | No     |
| Delete the trip                                                | Yes   | No     | No     |

Users manage their own comments and votes. Owners must transfer ownership before leaving. Services resolve membership from PostgreSQL; client-supplied roles cannot authorize operations. Nonmembers receive the same not-found response as missing trips. HTTP mutations validate input and Origin. Authentication rate limits use database storage; deployment must sanitize forwarded IP headers and prevent direct origin access.

## Scheduling and concurrent edits

Trip dates use PostgreSQL DATE; activity times use TIMESTAMPTZ and convert through the trip's IANA timezone. Validation rejects nonexistent or ambiguous local times and unsupported overnight ranges. Date ranges are bounded to 90 inclusive days. Saving the first activity on an empty date creates its day in the same transaction.

Editable resources expose revisions. Services compare them under the relevant transaction/lock before changing data and recording history. Stale edits return a conflict instead of silently overwriting another member's work. Detail and itinerary revisions are independent, except scheduling-related trip edits also invalidate the itinerary. Bookmark/comment edits have their own versions.

Reordering uses temporary unused positions before writing the final order, preserving uniqueness throughout the transaction. UI writes can show optimistic feedback, but failures roll back to confirmed data. Forms capture their opening revision; incoming changes preserve drafts and require an explicit review. Drafts are kept for the trip view, not persisted across full browser reloads.

## Realtime contract

The browser subscribes to `/live/trips/:tripId` on the application origin. The gateway rejects incorrect Origin, missing sessions, and unauthorized trip access before accepting a connection. It delegates session/membership checks to a fixed loopback HTTP endpoint rather than interpreting cookies itself. Socket messages cannot perform writes.

A PostgreSQL trigger notifies listeners when an itinerary revision changes or trip membership changes. PostgreSQL delivers notifications after commit; rolled-back writes publish nothing. Payloads contain only trip IDs. One dedicated LISTEN connection per process receives hints across application replicas.

Authorized messages contain `{ type: "itinerary.changed", version, role }`. Revisions are snapshot watermarks, not a durable event log. Clients ignore older/duplicate hints and fetch a complete authorized itinerary for newer revisions. Reconnects and tab resume fetch a fresh snapshot. Local writes take priority over incoming reads, and late snapshots cannot lower the current revision.

The gateway rechecks authorization during notifications and every 15 seconds alongside ping/pong heartbeats. Membership removal, trip deletion, and revoked/expired sessions end access. Temporary database/auth failures close the connection; clients retry with exponential backoff and jitter. Listener recovery resynchronizes subscribers, and periodic revision checks repair missed notifications. PostgreSQL already supplies the signaling needed here, so Redis is unnecessary for this scope.

Defensive limits bound connections, pending handshakes, incoming payloads, and outbound buffers. These are not benchmarked capacity claims. Durable event replay or presence would require additional contracts and storage decisions.

## Deployment and operational limits

The current setup provides a local PostgreSQL container and CI verification. Deployment automation, AWS resources, Redis, object storage, and background workers are not configured.

A deployment needs HTTPS, a persistent Node process, a PostgreSQL connection budget, secrets, and a proxy supporting WebSocket upgrades. Use least-privilege runtime database access and a separate migration role. `/api/health` measures application liveness; it does not prove database readiness.

Email is synchronous and production SMTP requires TLS. Invitations commit before delivery; the inbox remains usable when delivery fails. A durable queue is appropriate when retries and failure isolation become requirements. Activity history is group-visible product data, not an immutable security audit log.

At higher load, measure connection pressure, query plans, and request latency before adding infrastructure. Presence may justify ephemeral Redis state; reminders may justify workers; search should begin with PostgreSQL. No performance results or cloud deployment are claimed.
