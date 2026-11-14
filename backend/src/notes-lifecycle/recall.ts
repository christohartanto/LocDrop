// OWNER: Wendy. B-6. Contract: api.md -> DELETE /notes/{id}
// Only the author can recall; the note status change and slot release happen in ONE transaction.

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { withAuth } from "../shared/auth";
import { config } from "../shared/config";
import { ddb, isConditionFailedAt, transactWrite } from "../shared/db";
import { HttpError, noContent } from "../shared/http";
import { noteKey } from "../shared/keys";
import type { NoteItem } from "../shared/model";
import { releaseSlot } from "../slots";

export const handler = withAuth(async (event, user) => {
  const id = event.pathParameters?.id ?? "";
  const res = await ddb.send(new GetCommand({ TableName: config.tableName, Key: noteKey(id), ConsistentRead: true }));
  const note = res.Item as NoteItem | undefined;

  // Not found OR not the author → 404, so we don't reveal other people's notes.
  if (!note || note.authorUsername !== user.username) throw new HttpError(404, "NOT_FOUND", "Note not found");
  if (note.status !== "active") throw new HttpError(410, "NOTE_GONE", "This note has already been read or recalled");

  try {
    await transactWrite([
      {
        Update: {
          TableName: config.tableName,
          Key: noteKey(id),
          UpdateExpression: "SET #status = :recalled, recalledAt = :now REMOVE gsi1pk, gsi1sk",
          ConditionExpression: "#status = :active AND authorUsername = :me",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":recalled": "recalled",
            ":active": "active",
            ":me": user.username,
            ":now": new Date().toISOString(),
          },
        },
      },
      releaseSlot(user.username),
    ]);
  } catch (err) {
    if (isConditionFailedAt(err, 0)) throw new HttpError(410, "NOTE_GONE", "This note has already been read or recalled");
    throw err;
  }
  return noContent();
});
