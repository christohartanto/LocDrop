import { describe, expect, it } from "vitest";
import { createUser, getUser, uniqueName } from "../../bench/lib/fixtures";
import { verifyToken } from "../../src/shared/auth";
import { handler as login } from "../../src/auth/login";
import { handler as me } from "../../src/auth/me";
import { handler as register } from "../../src/auth/register";
import { makeEvent, parse } from "./helpers";

describe("POST /auth/register (A-1)", () => {
  it("creates the user → 201 with a working token; password is hashed; count starts at 0", async () => {
    const username = uniqueName("reg");
    const res = parse(await register(makeEvent({ body: { username, password: "password123" } })));
    expect(res.status).toBe(201);
    expect(res.body.username).toBe(username);
    expect(verifyToken(res.body.token)).toEqual({ username });

    const stored = await getUser(username);
    expect(stored?.activeNoteCount).toBe(0);
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored?.passwordHash).not.toContain("password123");
  });

  it("lower-cases the username", async () => {
    const lower = uniqueName("case");
    const res = parse(await register(makeEvent({ body: { username: lower.toUpperCase(), password: "password123" } })));
    expect(res.status).toBe(201);
    expect(res.body.username).toBe(lower);
  });

  it("duplicate username → 409 USERNAME_TAKEN", async () => {
    const username = uniqueName("dup");
    await register(makeEvent({ body: { username, password: "password123" } }));
    const res = parse(await register(makeEvent({ body: { username, password: "different99" } })));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("USERNAME_TAKEN");
  });

  it("5 simultaneous registrations of the same name → exactly one succeeds", async () => {
    const username = uniqueName("race");
    const results = (
      await Promise.all(Array.from({ length: 5 }, () => register(makeEvent({ body: { username, password: "password123" } }))))
    ).map(parse);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
  });

  it.each([
    ["too short username", { username: "ab", password: "password123" }],
    ["bad characters", { username: "bad name!", password: "password123" }],
    ["short password", { username: "validname", password: "short" }],
    ["missing password", { username: "validname" }],
  ])("bad input (%s) → 400 VALIDATION_ERROR", async (_label, body) => {
    const res = parse(await register(makeEvent({ body })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("invalid JSON → 400", async () => {
    expect(parse(await register(makeEvent({ rawBody: "{not json" }))).status).toBe(400);
  });
});

describe("POST /auth/login (A-2)", () => {
  it("right password → 200 with token", async () => {
    const username = uniqueName("log");
    await register(makeEvent({ body: { username, password: "password123" } }));
    const res = parse(await login(makeEvent({ body: { username: username.toUpperCase(), password: "password123" } })));
    expect(res.status).toBe(200);
    expect(res.body.username).toBe(username);
    expect(verifyToken(res.body.token)).toEqual({ username });
  });

  it("wrong password and unknown user give the SAME 401 INVALID_CREDENTIALS", async () => {
    const username = uniqueName("log");
    await register(makeEvent({ body: { username, password: "password123" } }));
    const wrong = parse(await login(makeEvent({ body: { username, password: "wrongpass1" } })));
    const unknown = parse(await login(makeEvent({ body: { username: uniqueName("nobody"), password: "password123" } })));
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("empty body → 400", async () => {
    expect(parse(await login(makeEvent({ body: {} }))).status).toBe(400);
  });
});

describe("GET /me (A-3)", () => {
  it("returns username, activeNoteCount and maxActiveNotes", async () => {
    const u = await createUser(uniqueName("me"));
    const res = parse(await me(makeEvent({ token: u.token })));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: u.username, activeNoteCount: 0, maxActiveNotes: 5 });
  });

  it("no token → 401; token for a deleted/unknown account → 401", async () => {
    expect(parse(await me(makeEvent())).status).toBe(401);
    const { signToken } = await import("../../src/shared/auth");
    expect(parse(await me(makeEvent({ token: signToken(uniqueName("ghost")) }))).status).toBe(401);
  });
});
