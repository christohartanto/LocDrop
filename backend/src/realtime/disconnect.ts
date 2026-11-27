// OWNER: Vincent. A-9. WebSocket $disconnect: forget the connection.
// API Gateway doesn't promise to call this every time, so connection items also expire (DynamoDB TTL)
// and notify forgets any connection that turns out to be gone.

import { deleteConnection } from "./connections";
import type { WsHandler } from "./ws-events";

export const handler: WsHandler = async (event) => {
  await deleteConnection(event.requestContext.connectionId);
  return { statusCode: 200 };
};
