// OWNER: Vincent. A-1. Contract: api.md -> POST /auth/register
// Username + password only (no email). The username is the user's id, so it must be unique:
// a conditional Put (attribute_not_exists) makes "two people register the same name at once" safe.

import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { hashPassword, signToken } from "../shared/auth";
import { config } from "../shared/config";
import { ddb, isConditionalCheckFailed } from "../shared/db";
import { HttpError, json, parseBody, withErrors } from "../shared/http";
import { userKey } from "../shared/keys";
import type { UserItem } from "../shared/model";
import { AuthBody } from "./validation";

export const handler = withErrors(async (event) => {
  const { username, password } = parseBody(event, AuthBody);

  const user: UserItem = {
    ...userKey(username),
    SK: "PROFILE",
    username,
    passwordHash: await hashPassword(password),
    activeNoteCount: 0,
    createdAt: new Date().toISOString(),
  };

  try {
    await ddb.send(
      new PutCommand({ TableName: config.tableName, Item: user, ConditionExpression: "attribute_not_exists(PK)" }),
    );
  } catch (err) {
    if (isConditionalCheckFailed(err)) throw new HttpError(409, "USERNAME_TAKEN", "Username is taken");
    throw err;
  }

  return json(201, { token: signToken(username), username });
});
