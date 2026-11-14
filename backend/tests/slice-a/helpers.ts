// OWNER: Vincent. Helpers for slice A tests.

import type { Event } from "../../src/shared/http";

export function makeEvent(opts: { token?: string; body?: unknown; rawBody?: string } = {}): Event {
  return {
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
    body: opts.rawBody ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    isBase64Encoded: false,
  } as unknown as Event;
}

export function parse(res: { statusCode?: number; body?: string }) {
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

export const noteBody = (over: Record<string, unknown> = {}) => ({
  text: "hello from a test",
  lat: 22.69,
  lng: 114.21,
  visibility: "public",
  anonymous: false,
  burnOnRead: false,
  ...over,
});
