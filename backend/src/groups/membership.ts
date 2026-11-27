// OWNER: Vincent. A-4. Frozen signature: notes-read/visibility.ts (Wendy) and notes-write/create.ts call isMember.

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "../shared/config";
import { ddb } from "../shared/db";
import { membershipKey } from "../shared/keys";

/** True if `username` created or joined group `groupId`. Unknown group → false. */
export async function isMember(username: string, groupId: string): Promise<boolean> {
  const res = await ddb.send(
    new GetCommand({ TableName: config.tableName, Key: membershipKey(username, groupId), ProjectionExpression: "PK" }),
  );
  return res.Item !== undefined;
}
