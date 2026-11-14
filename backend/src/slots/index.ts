// OWNER: Vincent. Frozen signatures; Wendy calls releaseSlot.
// The ONLY code allowed to change a user's activeNoteCount (except the A-8 naive benchmark version).
// Both functions return a transaction item so callers can combine them atomically with a note write.

import { config } from "../shared/config";
import type { TransactItem } from "../shared/db";
import { userKey } from "../shared/keys";

/** +1 to activeNoteCount, only if the user exists and has fewer than N active notes. */
export function reserveSlot(username: string): TransactItem {
  return {
    Update: {
      TableName: config.tableName,
      Key: userKey(username),
      UpdateExpression: "ADD activeNoteCount :one",
      ConditionExpression: "attribute_exists(PK) AND activeNoteCount < :max",
      ExpressionAttributeValues: { ":one": 1, ":max": config.maxActiveNotes },
    },
  };
}

/** -1 to activeNoteCount, only if the user exists and the count is above zero. */
export function releaseSlot(username: string): TransactItem {
  return {
    Update: {
      TableName: config.tableName,
      Key: userKey(username),
      UpdateExpression: "ADD activeNoteCount :minusOne",
      ConditionExpression: "attribute_exists(PK) AND activeNoteCount > :zero",
      ExpressionAttributeValues: { ":minusOne": -1, ":zero": 0 },
    },
  };
}
