// SHARED (Phase 0a). Lambda-style HTTP helpers (API Gateway HTTP API v2).

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { z } from "zod";
import type { ErrorCode } from "./api-types";

export type Event = APIGatewayProxyEventV2;
export type Result = APIGatewayProxyStructuredResultV2;
export type Handler = (event: Event) => Promise<Result>;

export class HttpError extends Error {
  constructor(public status: number, public code: ErrorCode, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export function json(status: number, body: unknown): Result {
  return { statusCode: status, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export function noContent(): Result {
  return { statusCode: 204, headers: {}, body: "" };
}

export function errorResult(status: number, code: ErrorCode, message: string): Result {
  return json(status, { error: { code, message } });
}

export function withErrors(fn: Handler): Handler {
  return async (event) => {
    try {
      return await fn(event);
    } catch (err) {
      if (err instanceof HttpError) return errorResult(err.status, err.code, err.message);
      console.error(err);
      return errorResult(500, "INTERNAL", "Internal server error");
    }
  };
}

function zodMessage(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

export function parseBody<T>(event: Event, schema: z.ZodType<T>): T {
  let raw: unknown;
  try {
    raw = event.body ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body) : {};
  } catch {
    throw new HttpError(400, "VALIDATION_ERROR", "Body must be valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", zodMessage(parsed.error));
  return parsed.data;
}

export function parseQuery<T>(event: Event, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(event.queryStringParameters ?? {});
  if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", zodMessage(parsed.error));
  return parsed.data;
}

export function notImplemented(id: string): never {
  throw new HttpError(501, "NOT_IMPLEMENTED", `${id} not implemented yet`);
}
