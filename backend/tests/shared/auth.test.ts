import { describe, expect, it } from "vitest";
import { signToken, verifyToken, withAuth } from "../../src/shared/auth";
import { json, type Event } from "../../src/shared/http";

const event = (headers: Record<string, string> = {}) => ({ headers } as unknown as Event);

describe("auth", () => {
  it("signToken / verifyToken round trip", () => {
    expect(verifyToken(signToken("alice"))).toEqual({ username: "alice" });
  });

  it("tampered token → null", () => {
    const t = signToken("alice");
    expect(verifyToken(t.slice(0, -2) + (t.endsWith("a") ? "bb" : "aa"))).toBeNull();
    expect(verifyToken("not-a-token")).toBeNull();
  });

  it("withAuth: no header → 401 UNAUTHENTICATED", async () => {
    const handler = withAuth(async () => json(200, { ok: true }));
    const res = await handler(event());
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body!).error.code).toBe("UNAUTHENTICATED");
  });

  it("withAuth: valid token → handler gets the username", async () => {
    const handler = withAuth(async (_e, user) => json(200, user));
    const res = await handler(event({ authorization: `Bearer ${signToken("bob")}` }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!)).toEqual({ username: "bob" });
  });
});
