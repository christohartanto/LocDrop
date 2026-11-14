// OWNER: Wendy. Helpers for slice B tests.

import type { Event } from "../../src/shared/http";

/** Minimal API Gateway v2 event for calling handlers directly. */
export function makeEvent(opts: {
  token?: string;
  body?: unknown;
  id?: string;
  query?: Record<string, string>;
}): Event {
  return {
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    pathParameters: opts.id ? { id: opts.id } : undefined,
    queryStringParameters: opts.query,
    isBase64Encoded: false,
  } as unknown as Event;
}

export function parse(res: { statusCode?: number; body?: string }) {
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

/** A random spot far from other tests' data, so nearby results don't mix between tests. */
export function freshSpot(): { lat: number; lng: number } {
  return { lat: -40 + Math.random() * 80, lng: -170 + Math.random() * 340 };
}
