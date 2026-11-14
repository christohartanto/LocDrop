// OWNER: Vincent. A-2. Contract: api.md -> POST /auth/login
// Same INVALID_CREDENTIALS error for "no such user" and "wrong password", so attackers can't
// discover which usernames exist.

import { randomUUID } from "node:crypto";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { hashPassword, signToken, verifyPassword } from "../shared/auth";
import { config } from "../shared/config";
import { ddb } from "../shared/db";
import { HttpError, json, parseBody, withErrors } from "../shared/http";
import { userKey } from "../shared/keys";
import type { UserItem } from "../shared/model";
import { LoginBody } from "./validation";

// A real bcrypt hash of a random string (made once at startup): comparing against it when the user
// doesn't exist keeps the response time similar, so timing doesn't reveal whether a username exists.
const DUMMY_HASH = hashPassword(randomUUID());

export const handler = withErrors(async (event) => {
  const { username, password } = parseBody(event, LoginBody);

  const res = await ddb.send(new GetCommand({ TableName: config.tableName, Key: userKey(username) }));
  const user = res.Item as UserItem | undefined;

  const ok = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH));
  if (!user || !ok) throw new HttpError(401, "INVALID_CREDENTIALS", "Wrong username or password");

  return json(200, { token: signToken(user.username), username: user.username });
});
