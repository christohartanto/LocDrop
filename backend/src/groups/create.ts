// OWNER: Vincent. A-4. Contract: api.md -> POST /groups
// One transaction writes the group, its join code, and the creator's membership.
// The join-code item has a uniqueness condition, so two groups can never share a code;
// on the (very rare) collision we pick a new code and try again.

import { randomUUID } from "node:crypto";
import { withAuth } from "../shared/auth";
import { config } from "../shared/config";
import { isConditionFailedAt, transactWrite } from "../shared/db";
import { json, parseBody } from "../shared/http";
import { groupKey, joinCodeKey, membershipKey } from "../shared/keys";
import { toGroup, type GroupItem, type JoinCodeItem, type MembershipItem } from "../shared/model";
import { CreateGroupBody, newJoinCode } from "./validation";

const MAX_CODE_ATTEMPTS = 5;

export const handler = withAuth(async (event, auth) => {
  const { name } = parseBody(event, CreateGroupBody);
  const groupId = randomUUID();
  const createdAt = new Date().toISOString();

  for (let attempt = 1; ; attempt++) {
    const joinCode = newJoinCode();
    const group: GroupItem = { ...groupKey(groupId), SK: "META", groupId, name, joinCode, createdBy: auth.username, createdAt };
    const code: JoinCodeItem = { ...joinCodeKey(joinCode), SK: "META", joinCode, groupId, name };
    const member: MembershipItem = {
      ...membershipKey(auth.username, groupId),
      username: auth.username,
      groupId,
      name,
      joinCode,
      joinedAt: createdAt,
    };
    try {
      await transactWrite([
        { Put: { TableName: config.tableName, Item: group, ConditionExpression: "attribute_not_exists(PK)" } },
        { Put: { TableName: config.tableName, Item: code, ConditionExpression: "attribute_not_exists(PK)" } },
        { Put: { TableName: config.tableName, Item: member } },
      ]);
      return json(201, toGroup(group));
    } catch (err) {
      if (isConditionFailedAt(err, 1) && attempt < MAX_CODE_ATTEMPTS) continue; // code taken: pick another
      throw err;
    }
  }
});
