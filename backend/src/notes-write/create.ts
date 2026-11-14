// OWNER: Vincent. A-6. Contract: api.md -> POST /notes
// The slot reservation and the note write happen in ONE DynamoDB transaction:
//   [ reserveSlot(author)  — only succeeds if activeNoteCount < N,
//     Put note             — only if the id is new ]
// Either both happen or neither does, so the N-note limit holds even under many simultaneous requests.

import { withAuth } from "../shared/auth";
import { config } from "../shared/config";
import { isConditionFailedAt, transactWrite } from "../shared/db";
import { HttpError, json, parseBody } from "../shared/http";
import { toMyNote } from "../shared/model";
import { isMember } from "../groups/membership";
import { reserveSlot } from "../slots";
import { buildNote, CreateNoteBody } from "./validation";

export const handler = withAuth(async (event, auth) => {
  const input = parseBody(event, CreateNoteBody);

  if (input.visibility === "group" && !(await isMember(auth.username, input.groupId!))) {
    throw new HttpError(403, "NOT_GROUP_MEMBER", "You are not a member of that group");
  }

  const note = buildNote(auth.username, input);
  try {
    await transactWrite([
      reserveSlot(auth.username),
      { Put: { TableName: config.tableName, Item: note, ConditionExpression: "attribute_not_exists(PK)" } },
    ]);
  } catch (err) {
    if (isConditionFailedAt(err, 0)) {
      throw new HttpError(409, "NOTE_LIMIT_REACHED", `You already have ${config.maxActiveNotes} active notes`);
    }
    throw err;
  }

  return json(201, toMyNote(note));
});
