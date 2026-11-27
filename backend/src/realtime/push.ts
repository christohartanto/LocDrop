// OWNER: Vincent. A-10. Sending one message down one WebSocket connection.
// On AWS this posts through API Gateway's management API. The local dev server and the tests swap in
// their own sender with setSender().

import {
  ApiGatewayManagementApiClient,
  GoneException,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { config } from "../shared/config";

/** "gone" = the phone is no longer connected; the caller should forget the connection. */
export type SendResult = "sent" | "gone";
export type Sender = (connectionId: string, message: unknown) => Promise<SendResult>;

let client: ApiGatewayManagementApiClient | null = null;

const awsSender: Sender = async (connectionId, message) => {
  if (!config.wsEndpoint) throw new Error("WS_ENDPOINT is not set");
  client ??= new ApiGatewayManagementApiClient({ endpoint: config.wsEndpoint, region: config.region });
  try {
    await client.send(
      new PostToConnectionCommand({ ConnectionId: connectionId, Data: Buffer.from(JSON.stringify(message)) }),
    );
    return "sent";
  } catch (err) {
    if (err instanceof GoneException || (err as { name?: string })?.name === "GoneException") return "gone";
    throw err;
  }
};

let sender: Sender = awsSender;

export function setSender(s: Sender | null): void {
  sender = s ?? awsSender;
}

export function send(connectionId: string, message: unknown): Promise<SendResult> {
  return sender(connectionId, message);
}
