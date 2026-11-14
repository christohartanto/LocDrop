// OWNER: Vincent. A-7. Contract: api.md -> GET /notes/mine
// All of my notes (any status), newest first, via GSI2 (gsi2pk = AUTHOR#<username>).

import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { withAuth } from "../shared/auth";
import { config } from "../shared/config";
import { ddb } from "../shared/db";
import { json } from "../shared/http";
import { authorPk, GSI2 } from "../shared/keys";
import { toMyNote, type NoteItem } from "../shared/model";

export const handler = withAuth(async (_event, auth) => {
  const notes: NoteItem[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: config.tableName,
        IndexName: GSI2,
        KeyConditionExpression: "gsi2pk = :pk",
        ExpressionAttributeValues: { ":pk": authorPk(auth.username) },
        ScanIndexForward: false, // newest first
        ExclusiveStartKey: startKey,
      }),
    );
    notes.push(...((res.Items ?? []) as NoteItem[]));
    startKey = res.LastEvaluatedKey;
  } while (startKey);

  return json(200, { notes: notes.map(toMyNote) });
});
