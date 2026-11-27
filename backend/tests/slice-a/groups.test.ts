import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi } from "vitest";
import { createUser, getUser, uniqueName } from "../../bench/lib/fixtures";
import { handler as createGroup } from "../../src/groups/create";
import { handler as joinGroup } from "../../src/groups/join";
import { handler as listGroups } from "../../src/groups/list";
import { isMember } from "../../src/groups/membership";
import { JOIN_CODE_ALPHABET, newJoinCode } from "../../src/groups/validation";
import { handler as createNote } from "../../src/notes-write/create";
import { handler as nearby } from "../../src/notes-read/nearby";
import { handler as open } from "../../src/notes-read/open";
import { config } from "../../src/shared/config";
import { ddb } from "../../src/shared/db";
import { joinCodeKey } from "../../src/shared/keys";
import { makeEvent as makeReadEvent, freshSpot } from "../slice-b/helpers";
import { makeEvent, noteBody, parse } from "./helpers";

// Lets one test force a join-code collision; every other call uses the real generator.
vi.mock("../../src/groups/validation", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/groups/validation")>();
  return { ...real, newJoinCode: vi.fn(real.newJoinCode) };
});

async function newGroup(token: string, name = "Study buddies") {
  const res = parse(await createGroup(makeEvent({ token, body: { name } })));
  expect(res.status).toBe(201);
  return res.body as { groupId: string; name: string; joinCode: string };
}

describe("POST /groups (A-4)", () => {
  it("creates a group → 201 { groupId, name, joinCode }; the creator is a member", async () => {
    const u = await createUser(uniqueName("gcre"));
    const res = parse(await createGroup(makeEvent({ token: u.token, body: { name: "  CSC4160 team  " } })));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ groupId: expect.any(String), name: "CSC4160 team", joinCode: expect.any(String) });
    expect(res.body.joinCode).toMatch(new RegExp(`^[${JOIN_CODE_ALPHABET}]{6}$`));
    expect(await isMember(u.username, res.body.groupId)).toBe(true);
  });

  it("a join code that's already taken → picks a new one", async () => {
    const u = await createUser(uniqueName("gcol"));
    const first = await newGroup(u.token, "first");
    vi.mocked(newJoinCode).mockReturnValueOnce(first.joinCode); // collides with the first group's code
    const second = await newGroup(u.token, "second");
    expect(second.joinCode).not.toBe(first.joinCode);

    const code = await ddb.send(new GetCommand({ TableName: config.tableName, Key: joinCodeKey(first.joinCode) }));
    expect(code.Item?.groupId).toBe(first.groupId); // the first group's code still points at it
  });

  it.each([
    ["missing name", {}],
    ["blank name", { name: "   " }],
    ["name over 40", { name: "x".repeat(41) }],
    ["name not a string", { name: 42 }],
  ])("%s → 400 VALIDATION_ERROR", async (_label, body) => {
    const u = await createUser(uniqueName("gval"));
    const res = parse(await createGroup(makeEvent({ token: u.token, body })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("no token → 401", async () => {
    expect(parse(await createGroup(makeEvent({ body: { name: "x" } }))).status).toBe(401);
  });
});

describe("POST /groups/join (A-4)", () => {
  it("joins with a code → 200 { groupId, name, joinCode }; now a member", async () => {
    const owner = await createUser(uniqueName("gown"));
    const friend = await createUser(uniqueName("gfrn"));
    const g = await newGroup(owner.token);
    expect(await isMember(friend.username, g.groupId)).toBe(false);

    const res = parse(await joinGroup(makeEvent({ token: friend.token, body: { joinCode: g.joinCode } })));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(g);
    expect(await isMember(friend.username, g.groupId)).toBe(true);
  });

  it("code is case-insensitive and ignores spaces and dashes", async () => {
    const owner = await createUser(uniqueName("gown"));
    const friend = await createUser(uniqueName("gfrn"));
    const g = await newGroup(owner.token);
    const typed = ` ${g.joinCode.slice(0, 3).toLowerCase()}-${g.joinCode.slice(3)} `;
    expect(parse(await joinGroup(makeEvent({ token: friend.token, body: { joinCode: typed } }))).status).toBe(200);
    expect(await isMember(friend.username, g.groupId)).toBe(true);
  });

  it("joining twice (or your own group) → 200, still listed once", async () => {
    const owner = await createUser(uniqueName("gown"));
    const g = await newGroup(owner.token);
    for (let i = 0; i < 2; i++) {
      expect(parse(await joinGroup(makeEvent({ token: owner.token, body: { joinCode: g.joinCode } }))).status).toBe(200);
    }
    const list = parse(await listGroups(makeEvent({ token: owner.token })));
    expect(list.body.groups).toEqual([g]);
  });

  it("unknown code → 404 NOT_FOUND", async () => {
    const u = await createUser(uniqueName("gunk"));
    const res = parse(await joinGroup(makeEvent({ token: u.token, body: { joinCode: "ZZZZZ2" } })));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it.each([
    ["missing code", {}],
    ["too short", { joinCode: "ABC" }],
    ["too long", { joinCode: "ABCDEFG" }],
    ["symbols", { joinCode: "ABC!@#" }],
  ])("%s → 400 VALIDATION_ERROR", async (_label, body) => {
    const u = await createUser(uniqueName("gjv"));
    const res = parse(await joinGroup(makeEvent({ token: u.token, body })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("no token → 401", async () => {
    expect(parse(await joinGroup(makeEvent({ body: { joinCode: "ABCDEF" } }))).status).toBe(401);
  });
});

describe("GET /groups (A-4)", () => {
  it("lists only my groups, sorted by name; empty for a new user", async () => {
    const me = await createUser(uniqueName("glst"));
    const other = await createUser(uniqueName("goth"));
    expect(parse(await listGroups(makeEvent({ token: me.token }))).body).toEqual({ groups: [] });

    const zebra = await newGroup(me.token, "Zebra club");
    const apple = await newGroup(other.token, "apple pickers");
    await newGroup(other.token, "Not mine");
    await joinGroup(makeEvent({ token: me.token, body: { joinCode: apple.joinCode } }));

    const res = parse(await listGroups(makeEvent({ token: me.token })));
    expect(res.status).toBe(200);
    expect(res.body.groups).toEqual([apple, zebra]);
  });

  it("doesn't confuse my profile with a group", async () => {
    const me = await createUser(uniqueName("gprf"));
    await newGroup(me.token);
    const res = parse(await listGroups(makeEvent({ token: me.token })));
    expect(res.body.groups).toHaveLength(1);
    expect(await getUser(me.username)).toBeDefined(); // profile item untouched
  });

  it("no token → 401", async () => {
    expect(parse(await listGroups(makeEvent({}))).status).toBe(401);
  });
});

describe("group notes end to end (A-4 + A-6 + B-3)", () => {
  it("members can write, see and open group notes; outsiders can't", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("gna"));
    const member = await createUser(uniqueName("gnm"));
    const outsider = await createUser(uniqueName("gno"));
    const g = await newGroup(author.token);
    await joinGroup(makeEvent({ token: member.token, body: { joinCode: g.joinCode } }));

    // outsider can't write into the group
    const denied = parse(
      await createNote(makeEvent({ token: outsider.token, body: noteBody({ ...spot, visibility: "group", groupId: g.groupId }) })),
    );
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("NOT_GROUP_MEMBER");
    expect((await getUser(outsider.username))?.activeNoteCount).toBe(0);

    // member of the group can
    const created = parse(
      await createNote(makeEvent({ token: author.token, body: noteBody({ ...spot, visibility: "group", groupId: g.groupId, text: "group secret" }) })),
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ visibility: "group", groupId: g.groupId });
    const id = created.body.id;

    const seenBy = async (token: string) =>
      parse(await nearby(makeReadEvent({ token, query: { lat: String(spot.lat), lng: String(spot.lng) } }))).body.notes.map(
        (n: { id: string }) => n.id,
      );
    expect(await seenBy(member.token)).toEqual([id]);
    expect(await seenBy(outsider.token)).toEqual([]);

    const memberOpen = parse(await open(makeReadEvent({ token: member.token, id, body: spot })));
    expect(memberOpen.status).toBe(200);
    expect(memberOpen.body.text).toBe("group secret");
    expect(parse(await open(makeReadEvent({ token: outsider.token, id, body: spot }))).status).toBe(404);
  });
});
