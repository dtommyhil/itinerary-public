'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseLiveMessage, reconnectDelay } from '@/domain/itinerary/live';
import type { TripRole } from '@/domain/trips/policies';
import type { Plan } from './activity-form';

export function useLiveItinerary({
  tripId,
  version,
  busy,
  role,
  onSnapshot,
}: {
  tripId: string;
  version: number;
  busy: boolean;
  role: TripRole;
  onSnapshot: (plan: Plan) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState('Connecting…');
  const current = useRef({ version, busy, role, onSnapshot });
  const wake = useRef<(() => void) | null>(null);
  useEffect(() => {
    current.current = { version, busy, role, onSnapshot };
    if (!busy) wake.current?.();
  }, [version, busy, role, onSnapshot]);
  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let fetching = false;
    let wanted = -1;
    let attempt = 0;
    const abort = new AbortController();
    function accessEnded() {
      if (disposed) return;
      disposed = true;
      clearTimeout(retry);
      socket?.close();
      router.replace('/trips');
      router.refresh();
    }
    async function sync() {
      if (disposed || fetching || current.current.busy || wanted < 0) return;
      fetching = true;
      const target = wanted;
      wanted = -1;
      try {
        const response = await fetch(`/api/trips/${tripId}/itinerary`, {
          cache: 'no-store',
          signal: abort.signal,
        });
        if ([401, 403, 404].includes(response.status)) return accessEnded();
        if (!response.ok) throw new Error('Unable to synchronize');
        const snapshot: Plan = await response.json();
        if (disposed) return;
        // An optimistic/local write takes priority. Re-fetch after it settles.
        if (current.current.busy) wanted = Math.max(wanted, target);
        else if (snapshot.version > current.current.version) {
          current.current.onSnapshot(snapshot);
          current.current.version = snapshot.version;
        }
      } catch {
        if (!disposed) {
          wanted = Math.max(wanted, target);
          setStatus('Reconnecting…');
        }
      } finally {
        fetching = false;
        // Further notifications/heartbeat retry failed reads; no busy retry loop.
        if (wanted > target && !current.current.busy) void sync();
      }
    }
    function connect() {
      if (disposed) return;
      const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(
        `${scheme}//${location.host}/live/trips/${tripId}`,
      );
      socket.onmessage = (event) => {
        const message = parseLiveMessage(String(event.data));
        if (!message || disposed) return;
        setStatus('Live');
        attempt = 0;
        if (message.role !== current.current.role) router.refresh();
        if (message.version > current.current.version) {
          wanted = Math.max(wanted, message.version);
          void sync();
        }
      };
      socket.onopen = () => {
        // Always read a fresh snapshot after reconnect; notifications aren't a log.
        wanted = Math.max(wanted, current.current.version);
        void sync();
      };
      socket.onclose = async (event) => {
        if (disposed) return;
        if (event.code === 1008) return accessEnded();
        setStatus('Reconnecting…');
        // Browser upgrade errors hide HTTP status. Resolve revoked access via
        // the ordinary authenticated API before retrying a denied handshake.
        try {
          const response = await fetch(`/api/trips/${tripId}/live-state`, {
            cache: 'no-store',
            signal: abort.signal,
          });
          if ([401, 403, 404].includes(response.status)) return accessEnded();
        } catch {
          /* Offline: retry with backoff. */
        }
        if (disposed) return;
        retry = setTimeout(connect, reconnectDelay(attempt++));
      };
    }
    wake.current = () => void sync();
    function resume() {
      if (!disposed && document.visibilityState === 'visible') {
        wanted = Math.max(wanted, current.current.version);
        void sync();
      }
    }
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    connect();
    return () => {
      disposed = true;
      abort.abort();
      clearTimeout(retry);
      wake.current = null;
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      socket?.close();
    };
  }, [tripId, router]);
  return status;
}
