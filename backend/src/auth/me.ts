// OWNER: Vincent. A-3. Contract: api.md -> GET /me

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { Me } from "../shared/api-types";
import { withAuth } from "../shared/auth";
import { config } from "../shared/config";
import { ddb } from "../shared/db";
import { HttpError, json } from "../shared/http";
import { userKey } from "../shared/keys";
import type { UserItem } from "../shared/model";

export const handler = withAuth(async (_event, auth) => {
  const res = await ddb.send(
    new GetCommand({ TableName: config.tableName, Key: userKey(auth.username), ConsistentRead: true }),
  );
  const user = res.Item as UserItem | undefined;
  // Valid token but the account is gone (e.g. local DB was reset): treat as logged out.
  if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Account not found; please log in again");

  const me: Me = { username: user.username, activeNoteCount: user.activeNoteCount, maxActiveNotes: config.maxActiveNotes };
  return json(200, me);
});
