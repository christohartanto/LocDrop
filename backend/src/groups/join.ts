// OWNER: Vincent. A-4. Contract: api.md -> POST /groups/join
// Look the code up directly (JOINCODE#<code>), then add a membership item.
// Joining a group you're already in is fine: 200, and your original join time is kept.

import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { withAuth } from "../shared/auth";
import { config } from "../shared/config";
import { ddb, isConditionalCheckFailed } from "../shared/db";
import { HttpError, json, parseBody } from "../shared/http";
import { joinCodeKey, membershipKey } from "../shared/keys";
import { toGroup, type JoinCodeItem, type MembershipItem } from "../shared/model";
import { JoinGroupBody } from "./validation";

export const handler = withAuth(async (event, auth) => {
  const { joinCode } = parseBody(event, JoinGroupBody);

  const res = await ddb.send(new GetCommand({ TableName: config.tableName, Key: joinCodeKey(joinCode) }));
  const code = res.Item as JoinCodeItem | undefined;
  if (!code) throw new HttpError(404, "NOT_FOUND", "No group has that join code");

  const member: MembershipItem = {
    ...membershipKey(auth.username, code.groupId),
    username: auth.username,
    groupId: code.groupId,
    name: code.name,
    joinCode: code.joinCode,
    joinedAt: new Date().toISOString(),
  };
  try {
    await ddb.send(
      new PutCommand({ TableName: config.tableName, Item: member, ConditionExpression: "attribute_not_exists(PK)" }),
    );
  } catch (err) {
    if (!isConditionalCheckFailed(err)) throw err; // already a member: nothing to do
  }

  return json(200, toGroup(code));
});
