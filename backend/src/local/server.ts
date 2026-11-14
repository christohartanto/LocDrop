// SHARED (Phase 0a). Local-only Express server: turns HTTP requests into API Gateway v2 events
// and calls the real Lambda handlers. Not deployed.

import { randomUUID } from "node:crypto";
import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import cors from "cors";
import express, { type Request, type Response } from "express";
import { config } from "../shared/config";
import { ddb } from "../shared/db";
import type { Event } from "../shared/http";
import { routes, type Route } from "./routes";

const PORT = Number(process.env.PORT ?? 3000);
const LOG = process.env.LOG_REQUESTS !== "0";
const DEV_ROUTES = process.env.DEV_ROUTES !== "0";

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.text({ type: "*/*", limit: "100kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function toEvent(req: Request, route: Route): Event {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v !== undefined) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(",") : v;
  }
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === "string") query[k] = v;
  }
  const qIndex = req.originalUrl.indexOf("?");
  const routeKey = `${route.method} ${route.path}`;
  const now = new Date();
  const body = typeof req.body === "string" && req.body.length > 0 ? req.body : undefined;

  return {
    version: "2.0",
    routeKey,
    rawPath: req.path,
    rawQueryString: qIndex >= 0 ? req.originalUrl.slice(qIndex + 1) : "",
    headers,
    queryStringParameters: Object.keys(query).length ? query : undefined,
    pathParameters: Object.keys(req.params).length ? { ...req.params } : undefined,
    body,
    isBase64Encoded: false,
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: `localhost:${PORT}`,
      domainPrefix: "localhost",
      http: {
        method: route.method,
        path: req.path,
        protocol: "HTTP/1.1",
        sourceIp: req.ip ?? "127.0.0.1",
        userAgent: req.get("user-agent") ?? "",
      },
      requestId: randomUUID(),
      routeKey,
      stage: "$default",
      time: now.toISOString(),
      timeEpoch: now.getTime(),
    },
  } as Event;
}

for (const route of routes) {
  if (route.devOnly && !DEV_ROUTES) continue;
  const expressPath = route.path.replace(/\{(\w+)\}/g, ":$1");
  const method = route.method.toLowerCase() as "get" | "post" | "delete";
  app[method](expressPath, async (req: Request, res: Response) => {
    const started = performance.now();
    try {
      const { handler } = await route.load();
      const result = await handler(toEvent(req, route));
      res.status(result.statusCode ?? 200);
      for (const [k, v] of Object.entries(result.headers ?? {})) res.setHeader(k, String(v));
      res.send(result.body ?? "");
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: { code: "INTERNAL", message: "Internal server error" } });
    } finally {
      if (LOG) console.log(`${route.method} ${req.originalUrl} → ${res.statusCode} (${(performance.now() - started).toFixed(1)} ms)`);
    }
  });
}

app.use((req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
});

const server = app.listen(PORT, async () => {
  console.log(`LocDrop local API on http://localhost:${PORT} (table ${config.tableName} @ ${config.dynamoEndpoint ?? "AWS"})`);
  try {
    await ddb.send(new DescribeTableCommand({ TableName: config.tableName }));
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "ResourceNotFoundException") {
      console.warn("⚠ Table not found. Run: npm run db:up, npm run db:init, npm run seed");
    } else {
      console.warn(`⚠ Cannot reach DynamoDB at ${config.dynamoEndpoint}. Is Docker running? Run: npm run db:up`);
    }
  }
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n✖ Port ${PORT} is already in use. Another LocDrop server is probably still running.`);
    console.error("  Close the other terminal running it, or find and stop it with:");
    console.error(`    Get-NetTCPConnection -LocalPort ${PORT} -State Listen | Select-Object OwningProcess`);
    console.error("    Stop-Process -Id <OwningProcess>");
    console.error("  Or use another port:  $env:PORT=\"3001\"; npm run dev:api\n");
    process.exit(1);
  }
  throw err;
});
