// SHARED (Phase 0a). Password hashing, JWT tokens, and the withAuth wrapper.

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config";
import { errorResult, withErrors, type Event, type Handler, type Result } from "./http";

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, config.bcryptCost);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export function signToken(username: string): string {
  return jwt.sign({}, config.jwtSecret, {
    algorithm: "HS256",
    subject: username,
    expiresIn: config.jwtTtl as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): { username: string } | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
    if (typeof payload === "object" && typeof payload.sub === "string" && payload.sub) {
      return { username: payload.sub };
    }
    return null;
  } catch {
    return null;
  }
}

export type AuthedHandler = (event: Event, user: { username: string }) => Promise<Result>;

/** Requires "Authorization: Bearer <token>". Missing/invalid → 401 UNAUTHENTICATED. Also applies withErrors. */
export function withAuth(fn: AuthedHandler): Handler {
  return withErrors(async (event) => {
    const header = event.headers?.authorization ?? event.headers?.Authorization ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const user = match ? verifyToken(match[1].trim()) : null;
    if (!user) return errorResult(401, "UNAUTHENTICATED", "Missing or invalid login token");
    return fn(event, user);
  });
}
