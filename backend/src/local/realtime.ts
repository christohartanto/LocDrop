// SHARED (A-9 / A-10, local only). Live pop-ups on the local dev server, without AWS:
//  - WebSocket on the same port as the API (ws://localhost:3000/?token=...), calling the same
//    connect / location / disconnect handlers that API Gateway calls on AWS
//  - a loop that reads DynamoDB Local's stream and hands note changes to the same notify handler
//    that the DynamoDB Stream trigger calls on AWS
// Not deployed.

import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import {
  DescribeStreamCommand,
  DynamoDBStreamsClient,
  GetRecordsCommand,
  GetShardIteratorCommand,
  type _Record,
} from "@aws-sdk/client-dynamodb-streams";
import type { DynamoDBStreamEvent } from "aws-lambda";
import { WebSocket, WebSocketServer } from "ws";
import { handler as connect } from "../realtime/connect";
import { handler as disconnect } from "../realtime/disconnect";
import { handler as location } from "../realtime/location";
import { handler as notify } from "../realtime/notify";
import { setSender } from "../realtime/push";
import { config } from "../shared/config";
import { ddb, sleep } from "../shared/db";

export function attachRealtime(server: Server, log: boolean): void {
  const sockets = new Map<string, WebSocket>();
  setSender(async (connectionId, message) => {
    const ws = sockets.get(connectionId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return "gone";
    ws.send(JSON.stringify(message));
    if (log) console.log(`WS → ${connectionId.slice(0, 8)} ${JSON.stringify(message).slice(0, 90)}`);
    return "sent";
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", async (req, socket, head) => {
    const connectionId = randomUUID();
    const query = Object.fromEntries(new URL(req.url ?? "/", "http://localhost").searchParams);
    const res = await connect({ requestContext: { connectionId, routeKey: "$connect" }, queryStringParameters: query });
    if (res.statusCode !== 200) {
      socket.write(`HTTP/1.1 ${res.statusCode} Unauthorized\r\nConnection: close\r\n\r\n`);
      socket.destroy();
      if (log) console.log(`WS connect refused (${res.statusCode})`);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.set(connectionId, ws);
      if (log) console.log(`WS connected ${connectionId.slice(0, 8)}`);
      ws.on("message", async (data) => {
        const body = data.toString();
        let action: unknown;
        try {
          action = (JSON.parse(body) as { action?: unknown })?.action;
        } catch {
          /* no route: dropped, like API Gateway */
        }
        if (action !== "location") return;
        const r = await location({ requestContext: { connectionId, routeKey: "location" }, body });
        if (log) console.log(`WS location ${connectionId.slice(0, 8)} → ${r.statusCode}`);
      });
      ws.on("close", async () => {
        sockets.delete(connectionId);
        await disconnect({ requestContext: { connectionId, routeKey: "$disconnect" } });
        if (log) console.log(`WS disconnected ${connectionId.slice(0, 8)}`);
      });
    });
  });

  void pollStream(log);
}

/** Reads the table's stream from DynamoDB Local and calls notify, like the Lambda trigger on AWS. */
async function pollStream(log: boolean): Promise<never> {
  const streams = new DynamoDBStreamsClient({
    endpoint: config.dynamoEndpoint,
    region: config.region,
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
  });
  let streamArn: string | undefined;
  const iterators = new Map<string, string>(); // shardId → next iterator
  const seen = new Set<string>();
  let lastDiscovery = 0;
  let firstDiscovery = true;
  let warned = false;

  for (;;) {
    try {
      if (!streamArn) {
        const t = await ddb.send(new DescribeTableCommand({ TableName: config.tableName }));
        streamArn = t.Table?.LatestStreamArn;
        if (!streamArn) throw new Error("table has no stream");
        iterators.clear();
        seen.clear();
        firstDiscovery = true;
        lastDiscovery = 0;
      }
      if (Date.now() - lastDiscovery > 3000) {
        const d = await streams.send(new DescribeStreamCommand({ StreamArn: streamArn }));
        for (const shard of d.StreamDescription?.Shards ?? []) {
          if (!shard.ShardId || seen.has(shard.ShardId)) continue;
          seen.add(shard.ShardId);
          if (shard.SequenceNumberRange?.EndingSequenceNumber && firstDiscovery) continue; // old, closed shard
          const it = await streams.send(
            new GetShardIteratorCommand({
              StreamArn: streamArn,
              ShardId: shard.ShardId,
              ShardIteratorType: firstDiscovery ? "LATEST" : "TRIM_HORIZON", // skip history on startup
            }),
          );
          if (it.ShardIterator) iterators.set(shard.ShardId, it.ShardIterator);
        }
        firstDiscovery = false;
        lastDiscovery = Date.now();
      }
      for (const [shardId, iterator] of iterators) {
        const r = await streams.send(new GetRecordsCommand({ ShardIterator: iterator }));
        if (r.NextShardIterator) iterators.set(shardId, r.NextShardIterator);
        else iterators.delete(shardId); // shard closed
        const notes = (r.Records ?? []).filter((x: _Record) => x.dynamodb?.Keys?.PK?.S?.startsWith("NOTE#"));
        if (notes.length) {
          if (log) console.log(`stream: ${notes.length} note change(s) → notify`);
          await notify({ Records: notes } as unknown as DynamoDBStreamEvent);
        }
      }
      warned = false;
    } catch (err) {
      if (!warned) console.warn(`⚠ live pop-ups: can't read the table stream yet (${(err as Error).message}); retrying`);
      warned = true;
      streamArn = undefined; // e.g. the table was reset: look it up again
      await sleep(3000);
    }
    await sleep(400);
  }
}
