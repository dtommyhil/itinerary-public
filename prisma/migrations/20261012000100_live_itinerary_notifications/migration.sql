-- PostgreSQL delivers NOTIFY only after commit, including writes from any replica.
-- Payloads are trip IDs only. Gateways re-check sessions/membership before delivery.
CREATE FUNCTION notify_itinerary_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pg_notify('itinerary_changed', OLD.id::text);
    RETURN OLD;
  END IF;
  IF NEW."itineraryVersion" IS DISTINCT FROM OLD."itineraryVersion" THEN
    PERFORM pg_notify('itinerary_changed', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trip_live_change AFTER UPDATE OR DELETE ON "Trip"
  FOR EACH ROW EXECUTE FUNCTION notify_itinerary_changed();

CREATE FUNCTION notify_trip_membership_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pg_notify('itinerary_changed', OLD."tripId"::text);
    RETURN OLD;
  END IF;
  PERFORM pg_notify('itinerary_changed', NEW."tripId"::text);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trip_member_live_change AFTER INSERT OR UPDATE OR DELETE ON "TripMember"
  FOR EACH ROW EXECUTE FUNCTION notify_trip_membership_changed();
