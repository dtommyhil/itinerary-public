import { describe, expect, it } from 'vitest';
import { parseLiveMessage, reconnectDelay } from '../src/domain/itinerary/live';

describe('live itinerary boundary', () => {
  it('accepts snapshot revisions with a recognized role', () => {
    expect(
      parseLiveMessage(
        JSON.stringify({
          type: 'itinerary.changed',
          version: 42,
          role: 'viewer',
        }),
      ),
    ).toEqual({ type: 'itinerary.changed', version: 42, role: 'viewer' });
  });
  it.each([
    '{',
    'null',
    '{"type":"edit","version":1,"role":"owner"}',
    '{"type":"itinerary.changed","version":-1,"role":"owner"}',
    '{"type":"itinerary.changed","version":1.5,"role":"owner"}',
    '{"type":"itinerary.changed","version":"2","role":"owner"}',
    '{"type":"itinerary.changed","version":1,"role":"admin"}',
  ])('rejects malformed or unsupported messages: %s', (message) => {
    expect(parseLiveMessage(message)).toBeNull();
  });
  it('backs off reconnections with bounded jitter rather than retrying indefinitely faster', () => {
    expect(reconnectDelay(0, 0)).toBe(500);
    expect(reconnectDelay(1, 0)).toBe(1000);
    expect(reconnectDelay(3, 0.5)).toBe(4250);
    expect(reconnectDelay(100, 1)).toBe(15500);
  });
});
