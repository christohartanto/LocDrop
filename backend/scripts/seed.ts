// SHARED (Phase 0a). Demo data from api.md ("Demo data"). Safe to run repeatedly (fixed ids, overwrites).

import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { hashPassword } from "../src/shared/auth";
import { config } from "../src/shared/config";
import { ddb } from "../src/shared/db";
import { encode, offsetMeters } from "../src/shared/geo";
import { noteIndexAttrs, noteKey, userKey } from "../src/shared/keys";
import type { NoteItem, UserItem } from "../src/shared/model";

const c = config.demoCenter;
const seedNotes = [
  { id: "seed-1", author: "alice", text: "Welcome to LocDrop!", north: 0, east: 0, anonymous: false, burnOnRead: false },
  { id: "seed-2", author: "bob", text: "Library is quiet today", north: 30, east: 0, anonymous: false, burnOnRead: false },
  { id: "seed-3", author: "alice", text: "Guess who wrote this", north: 0, east: 60, anonymous: true, burnOnRead: false },
  { id: "seed-4", author: "bob", text: "First reader takes it!", north: -20, east: 0, anonymous: false, burnOnRead: true },
  { id: "seed-5", author: "alice", text: "You found me from far away", north: 0, east: -300, anonymous: false, burnOnRead: false },
];
const users = ["alice", "bob", "carol"];

try {
  const passwordHash = await hashPassword("password123");
  const now = new Date().toISOString();

  for (const username of users) {
    const user: UserItem = {
      ...userKey(username),
      SK: "PROFILE",
      username,
      passwordHash,
      activeNoteCount: seedNotes.filter((n) => n.author === username).length,
      createdAt: now,
    };
    await ddb.send(new PutCommand({ TableName: config.tableName, Item: user }));
  }

  for (const s of seedNotes) {
    const { lat, lng } = offsetMeters(c.lat, c.lng, s.north, s.east);
    const geohash = encode(lat, lng);
    const note: NoteItem = {
      ...noteKey(s.id),
      SK: "META",
      id: s.id,
      authorUsername: s.author,
      text: s.text,
      lat,
      lng,
      geohash,
      visibility: "public",
      anonymous: s.anonymous,
      burnOnRead: s.burnOnRead,
      status: "active",
      createdAt: now,
      ...noteIndexAttrs({ id: s.id, geohash, authorUsername: s.author, createdAt: now }),
    };
    await ddb.send(new PutCommand({ TableName: config.tableName, Item: note }));
  }

  console.log(`Seeded table ${config.tableName}:`);
  console.log(`  users: ${users.join(", ")} (password: password123)`);
  console.log(`  notes: ${seedNotes.map((n) => n.id).join(", ")} around (${c.lat}, ${c.lng})`);
} catch (err) {
  console.error("Seed failed. Did you run npm run db:up and npm run db:init?");
  console.error(err);
  process.exit(1);
}
