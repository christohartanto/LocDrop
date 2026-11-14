// OWNER: Wendy. B-4 + B-5. Contract: api.md -> POST /notes/{id}/open
// Check order (api.md): body → exists & visible (404) → active (410) → in range (403) → burn-on-read (B-5).

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { withAuth } from "../shared/auth";
import { config } from "../shared/config";
import { ddb } from "../shared/db";
import { distanceM } from "../shared/geo";
import { HttpError, json, parseBody } from "../shared/http";
import { noteKey } from "../shared/keys";
import { toNoteDetail, type NoteItem } from "../shared/model";
import { consumeNote } from "../notes-lifecycle/consume";
import { canSee } from "./visibility";

const Body = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const handler = withAuth(async (event, user) => {
  const { lat, lng } = parseBody(event, Body);
  const id = event.pathParameters?.id ?? "";

  const res = await ddb.send(new GetCommand({ TableName: config.tableName, Key: noteKey(id), ConsistentRead: true }));
  const note = res.Item as NoteItem | undefined;

  if (!note || !(await canSee(note, user.username))) throw new HttpError(404, "NOT_FOUND", "Note not found");
  if (note.status !== "active") throw new HttpError(410, "NOTE_GONE", "This note has already been read or recalled");

  const d = distanceM(lat, lng, note.lat, note.lng);
  if (d > config.readRadiusM) {
    throw new HttpError(403, "OUT_OF_RANGE", `You are ${Math.round(d)} m away; move within ${config.readRadiusM} m`);
  }

  if (note.burnOnRead && note.authorUsername !== user.username) {
    await consumeNote(note, user.username); // throws 410 if another reader won
    return json(200, toNoteDetail(note, d, true));
  }
  return json(200, toNoteDetail(note, d, false));
});
