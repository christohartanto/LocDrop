// OWNER: Vincent. A-9. WebSocket $connect: wss://.../?token=<login token>
// A bad or missing token gets 401, which makes API Gateway refuse the connection.
// The connection only starts getting pop-ups after its first "location" message.

import { verifyToken } from "../shared/auth";
import { saveConnection } from "./connections";
import type { WsHandler } from "./ws-events";

export const handler: WsHandler = async (event) => {
  const user = verifyToken(event.queryStringParameters?.token ?? "");
  if (!user) return { statusCode: 401, body: "Missing or invalid login token" };
  await saveConnection(event.requestContext.connectionId, user.username);
  return { statusCode: 200 };
};
