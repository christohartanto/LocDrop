// OWNER: Vincent. A-4. Contract: api.md -> GET /groups
// My memberships are the USER#<me> items whose sort key starts with GROUP#: one Query, sorted by name.

import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { withAuth } from "../shared/auth";
import { config } from "../shared/config";
import { ddb } from "../shared/db";
import { json } from "../shared/http";
import { MEMBERSHIP_SK_PREFIX, userKey } from "../shared/keys";
import { toGroup, type MembershipItem } from "../shared/model";

export const handler = withAuth(async (_event, auth) => {
  const items: MembershipItem[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: config.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: { ":pk": userKey(auth.username).PK, ":prefix": MEMBERSHIP_SK_PREFIX },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((res.Items ?? []) as MembershipItem[]));
    startKey = res.LastEvaluatedKey;
  } while (startKey);

  const groups = items.map(toGroup).sort((a, b) => a.name.localeCompare(b.name) || a.groupId.localeCompare(b.groupId));
  return json(200, { groups });
});
