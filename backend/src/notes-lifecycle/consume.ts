// OWNER: Wendy. B-5. First-reader rule: exactly one reader wins a "delete after first read" note.
// The note's status change and the author's slot release happen in ONE transaction.

import { config } from "../shared/config";
import { isConditionFailedAt, transactWrite } from "../shared/db";
import { HttpError } from "../shared/http";
import { noteKey } from "../shared/keys";
import type { NoteItem } from "../shared/model";
import { releaseSlot } from "../slots";

/** Marks the note consumed by `reader`. Throws 410 NOTE_GONE if someone else got there first. */
export async function consumeNote(note: NoteItem, reader: string): Promise<void> {
  try {
    await transactWrite([
      {
        Update: {
          TableName: config.tableName,
          Key: noteKey(note.id),
          UpdateExpression: "SET #status = :consumed, consumedBy = :reader, consumedAt = :now REMOVE gsi1pk, gsi1sk",
          ConditionExpression: "#status = :active",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":consumed": "consumed",
            ":active": "active",
            ":reader": reader,
            ":now": new Date().toISOString(),
          },
        },
      },
      releaseSlot(note.authorUsername),
    ]);
  } catch (err) {
    if (isConditionFailedAt(err, 0)) throw new HttpError(410, "NOTE_GONE", "This note has already been read or recalled");
    throw err;
  }
}
