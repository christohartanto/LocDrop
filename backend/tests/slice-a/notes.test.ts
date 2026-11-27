import { describe, expect, it } from "vitest";
import { countActiveNotes, createNoteDirect, createUser, getNote, getUser, uniqueName } from "../../bench/lib/fixtures";
import { encode } from "../../src/shared/geo";
import { handler as create } from "../../src/notes-write/create";
import { handler as createNaive } from "../../src/notes-write/create-naive";
import { handler as mine } from "../../src/notes-write/mine";
import { makeEvent, noteBody, parse } from "./helpers";

describe("POST /notes (A-6)", () => {
  it("creates an active note → 201 MyNote; saved with geohash + index keys; count +1", async () => {
    const u = await createUser(uniqueName("cre"));
    const res = parse(await create(makeEvent({ token: u.token, body: noteBody({ text: "  hi there  ", anonymous: true }) })));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ text: "hi there", status: "active", anonymous: true, burnOnRead: false, visibility: "public" });
    expect(res.body).not.toHaveProperty("authorUsername");

    const stored = await getNote(res.body.id);
    expect(stored?.authorUsername).toBe(u.username);
    expect(stored?.geohash).toBe(encode(22.69, 114.21));
    expect(stored?.gsi1pk).toBe(`CELL#${stored?.geohash}`);
    expect(stored?.gsi2pk).toBe(`AUTHOR#${u.username}`);
    expect((await getUser(u.username))?.activeNoteCount).toBe(1);
  });

  it("6th note → 409 NOTE_LIMIT_REACHED and nothing is saved", async () => {
    const u = await createUser(uniqueName("lim"));
    for (let i = 0; i < 5; i++) {
      expect(parse(await create(makeEvent({ token: u.token, body: noteBody({ text: `n${i}` }) }))).status).toBe(201);
    }
    const sixth = parse(await create(makeEvent({ token: u.token, body: noteBody({ text: "one too many" }) })));
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe("NOTE_LIMIT_REACHED");
    expect((await getUser(u.username))?.activeNoteCount).toBe(5);
    expect(await countActiveNotes(u.username)).toBe(5);
  });

  it("20 simultaneous creates → exactly 5 succeed, count matches real notes", async () => {
    const u = await createUser(uniqueName("par"));
    const results = (
      await Promise.all(Array.from({ length: 20 }, (_, i) => create(makeEvent({ token: u.token, body: noteBody({ text: `p${i}` }) }))))
    ).map(parse);
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(15);
    expect((await getUser(u.username))?.activeNoteCount).toBe(5);
    expect(await countActiveNotes(u.username)).toBe(5);
  });

  it("group note for a group I'm not in → 403 NOT_GROUP_MEMBER", async () => {
    const u = await createUser(uniqueName("grp"));
    const res = parse(await create(makeEvent({ token: u.token, body: noteBody({ visibility: "group", groupId: "g1" }) })));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_GROUP_MEMBER");
    expect((await getUser(u.username))?.activeNoteCount).toBe(0);
  });

  it.each([
    ["empty text", { text: "   " }],
    ["text over 280", { text: "x".repeat(281) }],
    ["lat out of range", { lat: 91 }],
    ["lng as string", { lng: "114" }],
    ["group without groupId", { visibility: "group" }],
    ["public with groupId", { groupId: "g1" }],
    ["missing anonymous", { anonymous: undefined }],
  ])("bad input (%s) → 400 VALIDATION_ERROR", async (_label, over) => {
    const u = await createUser(uniqueName("bad"));
    const res = parse(await create(makeEvent({ token: u.token, body: noteBody(over) })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("no token → 401", async () => {
    expect(parse(await create(makeEvent({ body: noteBody() }))).status).toBe(401);
  });
});

describe("GET /notes/mine (A-7)", () => {
  it("lists only my notes, all statuses, newest first", async () => {
    const u = await createUser(uniqueName("mine"));
    const other = await createUser(uniqueName("othr"));
    const first = parse(await create(makeEvent({ token: u.token, body: noteBody({ text: "first" }) }))).body;
    await new Promise((r) => setTimeout(r, 5));
    const second = parse(await create(makeEvent({ token: u.token, body: noteBody({ text: "second" }) }))).body;
    await createNoteDirect(other.username, { lat: 22.69, lng: 114.21, text: "not mine" });

    const res = parse(await mine(makeEvent({ token: u.token })));
    expect(res.status).toBe(200);
    expect(res.body.notes.map((n: { id: string }) => n.id)).toEqual([second.id, first.id]);
    expect(res.body.notes[0]).toMatchObject({ text: "second", status: "active" });
  });

  it("empty list for a new user; 401 without token", async () => {
    const u = await createUser(uniqueName("empt"));
    expect(parse(await mine(makeEvent({ token: u.token }))).body).toEqual({ notes: [] });
    expect(parse(await mine(makeEvent())).status).toBe(401);
  });
});

describe("POST /dev/naive/notes (A-8 comparison)", () => {
  it("works one-at-a-time (stops at 5) — the bug only shows up under concurrency", async () => {
    const u = await createUser(uniqueName("nai"));
    for (let i = 0; i < 5; i++) {
      expect(parse(await createNaive(makeEvent({ token: u.token, body: noteBody() }))).status).toBe(201);
    }
    expect(parse(await createNaive(makeEvent({ token: u.token, body: noteBody() }))).status).toBe(409);
  });
});
