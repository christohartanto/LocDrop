// OWNER: Vincent. A-9. The bits of API Gateway's WebSocket event we use (aws-lambda's own types for
// $connect leave out queryStringParameters, so we describe the shape here).

export interface WsEvent {
  requestContext: { connectionId: string; routeKey: string };
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: string | null;
  isBase64Encoded?: boolean;
}

export interface WsResult {
  statusCode: number;
  body?: string;
}

export type WsHandler = (event: WsEvent) => Promise<WsResult>;
