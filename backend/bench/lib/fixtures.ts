// SHARED (Phase 0a). Test/benchmark data written straight to DynamoDB, so benchmarks
// don't depend on other people's endpoints.

import { randomUUID } from "node:crypto";
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";
import { signToken } from "../../src/shared/auth";
import { config } from "../../src/shared/config";
import { ddb } from "../../src/shared/db";
import { encode } from "../../src/shared/geo";
import { authorPk, GSI2, noteIndexAttrs, noteKey, userKey } from "../../src/shared/keys";
import type { NoteItem, UserItem } from "../../src/shared/model";

let counter = 0;
/** Lowercase, unique, ≤ 20 chars, matches ^[a-z0-9_]{3,20}$. */
export function uniqueName(prefix: string): string {
  counter++;
  const suffix = `${Date.now().toString(36).slice(-5)}${counter.toString(36)}${Math.random().toString(36).slice(2, 4)}`;
  return `${prefix.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 8)}_${suffix}`.slice(0, 20);
}

let cachedHash: string | null = null;
async function fixtureHash(): Promise<string> {
  cachedHash ??= await bcrypt.hash("password123", 4);
  return cachedHash;
}

export async function createUser(username: string): Promise<{ username: string; token: string }> {
  const user: UserItem = {
    ...userKey(username),
    SK: "PROFILE",
    username,
    passwordHash: await fixtureHash(),
    activeNoteCount: 0,
    createdAt: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: config.tableName, Item: user }));
  return { username, token: signToken(username) };
}

/** Puts an active note and adds 1 to the author's activeNoteCount (no limit check). */
export async function createNoteDirect(
  author: string,
  opts: { lat: number; lng: number; burnOnRead?: boolean; anonymous?: boolean; text?: string; visibility?: "public" | "group"; groupId?: string },
): Promise<NoteItem> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const geohash = encode(opts.lat, opts.lng);
  const note: NoteItem = {
    ...noteKey(id),
    SK: "META",
    id,
    authorUsername: author,
    text: opts.text ?? "fixture note",
    lat: opts.lat,
    lng: opts.lng,
    geohash,
    visibility: opts.visibility ?? "public",
    groupId: opts.groupId,
    anonymous: opts.anonymous ?? false,
    burnOnRead: opts.burnOnRead ?? false,
    status: "active",
    createdAt,
    ...noteIndexAttrs({ id, geohash, authorUsername: author, createdAt }),
  };
  await ddb.send(new PutCommand({ TableName: config.tableName, Item: note }));
  await ddb.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: userKey(author),
      UpdateExpression: "ADD activeNoteCount :one",
      ExpressionAttributeValues: { ":one": 1 },
    }),
  );
  return note;
}

export async function getUser(username: string): Promise<UserItem | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: config.tableName, Key: userKey(username), ConsistentRead: true }));
  return res.Item as UserItem | undefined;
}

export async function getNote(id: string): Promise<NoteItem | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: config.tableName, Key: noteKey(id), ConsistentRead: true }));
  return res.Item as NoteItem | undefined;
}

/** Number of notes by this author with status "active" (via GSI2). */
export async function countActiveNotes(username: string): Promise<number> {
  let count = 0;
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: config.tableName,
        IndexName: GSI2,
        KeyConditionExpression: "gsi2pk = :pk",
        ExpressionAttributeValues: { ":pk": authorPk(username) },
        ExclusiveStartKey: startKey,
      }),
    );
    count += (res.Items ?? []).filter((i) => i.status === "active").length;
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  return count;
}
