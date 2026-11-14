// In-memory fake database for mock mode. Starts with the demo data from api.md
// (same users and notes as `npm run seed`). Resets on page reload.

import type { MyNote, Visibility } from "../api/types";
import { DEMO_CENTER, offsetMeters } from "../lib/geo";

export const MAX_ACTIVE_NOTES = 5;
export const READ_RADIUS_M = 100;

export interface MockUser {
  username: string;
  password: string;
}

export interface MockNote extends MyNote {
  authorUsername: string;
  consumedBy?: string;
}

export const users = new Map<string, MockUser>(
  ["alice", "bob", "carol"].map((u) => [u, { username: u, password: "password123" }]),
);

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function seedNote(
  id: string,
  author: string,
  text: string,
  north: number,
  east: number,
  opts: { anonymous?: boolean; burnOnRead?: boolean; visibility?: Visibility; minutes: number },
): MockNote {
  const { lat, lng } = offsetMeters(DEMO_CENTER.lat, DEMO_CENTER.lng, north, east);
  return {
    id,
    authorUsername: author,
    text,
    lat,
    lng,
    visibility: opts.visibility ?? "public",
    anonymous: opts.anonymous ?? false,
    burnOnRead: opts.burnOnRead ?? false,
    status: "active",
    createdAt: minutesAgo(opts.minutes),
  };
}

export const notes = new Map<string, MockNote>(
  [
    seedNote("seed-1", "alice", "Welcome to LocDrop!", 0, 0, { minutes: 3 }),
    seedNote("seed-2", "bob", "Library is quiet today", 30, 0, { minutes: 25 }),
    seedNote("seed-3", "alice", "Guess who wrote this", 0, 60, { anonymous: true, minutes: 70 }),
    seedNote("seed-4", "bob", "First reader takes it!", -20, 0, { burnOnRead: true, minutes: 8 }),
    seedNote("seed-5", "alice", "You found me from far away", 0, -300, { minutes: 180 }),
  ].map((n) => [n.id, n]),
);

export function activeCount(username: string): number {
  let count = 0;
  for (const n of notes.values()) if (n.authorUsername === username && n.status === "active") count++;
  return count;
}

export const tokenFor = (username: string) => `mock-token-${username}`;
export function usernameFromToken(header: string | null): string | null {
  const m = /^Bearer mock-token-([a-z0-9_]+)$/.exec(header ?? "");
  return m && users.has(m[1]) ? m[1] : null;
}
