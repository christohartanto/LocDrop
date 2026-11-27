// OWNER: Vincent. A-10. Triggered by the table's DynamoDB Stream (template.yaml filters it to NOTE# items).
//
//   note becomes active (new note)          → { type: "note_nearby", note: NoteSummary } to every connection
//                                             within the read radius that may see it (same rules as
//                                             GET /notes/nearby), except the author's own connections
//   note stops being active (read/recalled) → { type: "note_gone", id } to connections in the same 9 cells
//                                             that may see it (no distance check: their list may be a few
//                                             metres out of date)
//
// Pop-ups are best effort: a failure on one record or one connection is logged and skipped, so one bad
// record never makes Lambda retry (and re-send) the whole batch. Connections that turn out to be gone are
// deleted.

import type { DynamoDBRecord, DynamoDBStreamEvent } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { canSee } from "../notes-read/visibility";
import { config } from "../shared/config";
import { distanceM } from "../shared/geo";
import { toNoteSummary, type ConnectionItem, type NoteItem } from "../shared/model";
import { connectionsNear, deleteConnection } from "./connections";
import { send } from "./push";

type Image = NonNullable<NonNullable<DynamoDBRecord["dynamodb"]>["NewImage"]>;

function noteFrom(image: Image | undefined): NoteItem | undefined {
  if (!image) return undefined;
  const item = unmarshall(image as Parameters<typeof unmarshall>[0]) as NoteItem;
  return typeof item.PK === "string" && item.PK.startsWith("NOTE#") && item.SK === "META" ? item : undefined;
}

/** canSee, with one membership lookup per user per note. */
function visibilityFor(note: NoteItem) {
  const cache = new Map<string, Promise<boolean>>();
  return (username: string) => {
    let v = cache.get(username);
    if (!v) cache.set(username, (v = canSee(note, username)));
    return v;
  };
}

async function deliver(conn: ConnectionItem, message: unknown): Promise<boolean> {
  try {
    if ((await send(conn.connectionId, message)) === "gone") {
      await deleteConnection(conn.connectionId);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`notify: sending to ${conn.connectionId} failed`, err);
    return false;
  }
}

export async function announceNew(note: NoteItem): Promise<number> {
  const mayShow = visibilityFor(note);
  const conns = await connectionsNear(note.lat, note.lng);
  const sent = await Promise.all(
    conns.map(async (c) => {
      if (c.username === note.authorUsername) return false;
      const d = distanceM(c.lat!, c.lng!, note.lat, note.lng);
      if (d > config.readRadiusM) return false;
      if (!(await mayShow(c.username))) return false;
      return deliver(c, { type: "note_nearby", note: toNoteSummary(note, d) });
    }),
  );
  return sent.filter(Boolean).length;
}

export async function announceGone(note: NoteItem): Promise<number> {
  const mayShow = visibilityFor(note);
  const conns = await connectionsNear(note.lat, note.lng);
  const sent = await Promise.all(
    conns.map(async (c) => ((await mayShow(c.username)) ? deliver(c, { type: "note_gone", id: note.id }) : false)),
  );
  return sent.filter(Boolean).length;
}

export async function handleRecord(record: DynamoDBRecord): Promise<void> {
  const before = noteFrom(record.dynamodb?.OldImage);
  const after = noteFrom(record.dynamodb?.NewImage);
  const wasActive = before?.status === "active";
  const isActive = after?.status === "active";
  if (!wasActive && isActive) await announceNew(after!);
  else if (wasActive && !isActive) await announceGone(before!); // consumed, recalled, or deleted
}

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  for (const record of event.Records) {
    try {
      await handleRecord(record);
    } catch (err) {
      console.error(`notify: record ${record.eventID ?? "?"} failed`, err);
    }
  }
};
