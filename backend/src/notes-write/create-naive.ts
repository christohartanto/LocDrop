// OWNER: Vincent. A-8. Dev-only route: POST /dev/naive/notes
// BENCHMARK ONLY: intentionally unsafe read-then-write. Never deployed.
//
// This is how the N-note limit would be written WITHOUT conditional writes:
//   1. read the user's activeNoteCount
//   2. if count < N, save the note
//   3. write back count + 1 (a plain SET, no condition)
// When many requests arrive at once they all read the same old count in step 1, all pass the check,
// and step 3 overwrites each other ("lost update"). A-8 compares this against create.ts.

import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { withAuth } from "../shared/auth";
import { config } from "../shared/config";
import { ddb, sleep } from "../shared/db";
import { HttpError, json, parseBody } from "../shared/http";
import { userKey } from "../shared/keys";
import { toMyNote, type UserItem } from "../shared/model";
import { buildNote, CreateNoteBody } from "./validation";

export const handler = withAuth(async (event, auth) => {
  const input = parseBody(event, CreateNoteBody);

  // 1. read
  const res = await ddb.send(
    new GetCommand({ TableName: config.tableName, Key: userKey(auth.username), ConsistentRead: true }),
  );
  const user = res.Item as UserItem | undefined;
  if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Account not found");
  const count = user.activeNoteCount;

  // 2. check (based on a value that may already be stale)
  if (count >= config.maxActiveNotes) {
    throw new HttpError(409, "NOTE_LIMIT_REACHED", `You already have ${config.maxActiveNotes} active notes`);
  }
  if (config.naiveDelayMs > 0) await sleep(config.naiveDelayMs); // optional: simulate network gap

  const note = buildNote(auth.username, input);
  await ddb.send(new PutCommand({ TableName: config.tableName, Item: note }));

  // 3. write back count + 1 with NO condition: concurrent requests overwrite each other
  await ddb.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: userKey(auth.username),
      UpdateExpression: "SET activeNoteCount = :next",
      ExpressionAttributeValues: { ":next": count + 1 },
    }),
  );

  return json(201, toMyNote(note));
});
