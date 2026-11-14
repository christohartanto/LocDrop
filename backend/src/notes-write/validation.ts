// OWNER: Vincent. Input rules for POST /notes (api.md "Validation rules"). Shared by create and create-naive.

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "../shared/config";
import { encode } from "../shared/geo";
import { noteIndexAttrs, noteKey } from "../shared/keys";
import type { NoteItem } from "../shared/model";

export const CreateNoteBody = z
  .object({
    text: z.string().trim().min(1, "must not be empty").max(config.noteMaxChars, `at most ${config.noteMaxChars} characters`),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    visibility: z.enum(["public", "group"]),
    groupId: z.string().min(1).max(100).optional(),
    anonymous: z.boolean(),
    burnOnRead: z.boolean(),
  })
  .refine((b) => (b.visibility === "group") === (b.groupId !== undefined), {
    message: "groupId is required for group notes and not allowed for public notes",
    path: ["groupId"],
  });

export type CreateNoteInput = z.infer<typeof CreateNoteBody>;

/** Build the full DynamoDB item for a new, active note. */
export function buildNote(author: string, input: CreateNoteInput): NoteItem {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const geohash = encode(input.lat, input.lng);
  return {
    ...noteKey(id),
    SK: "META",
    id,
    authorUsername: author,
    text: input.text,
    lat: input.lat,
    lng: input.lng,
    geohash,
    visibility: input.visibility,
    groupId: input.groupId,
    anonymous: input.anonymous,
    burnOnRead: input.burnOnRead,
    status: "active",
    createdAt,
    ...noteIndexAttrs({ id, geohash, authorUsername: author, createdAt }),
  };
}
