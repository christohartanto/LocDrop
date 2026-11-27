import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import type { DynamoDBRecord, DynamoDBStreamEvent } from "aws-lambda";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNoteDirect, createUser, uniqueName } from "../../bench/lib/fixtures";
import { handler as createGroup } from "../../src/groups/create";
import { handler as connect } from "../../src/realtime/connect";
import { connectionsNear } from "../../src/realtime/connections";
import { handler as disconnect } from "../../src/realtime/disconnect";
import { handler as location } from "../../src/realtime/location";
import { handler as notify } from "../../src/realtime/notify";
import { setSender, type SendResult } from "../../src/realtime/push";
import type { WsEvent } from "../../src/realtime/ws-events";
import { config } from "../../src/shared/config";
import { ddb } from "../../src/shared/db";
import { offsetMeters } from "../../src/shared/geo";
import { connKey } from "../../src/shared/keys";
import type { NoteItem } from "../../src/shared/model";
import { makeEvent, parse } from "../slice-a/helpers";
import { freshSpot } from "../slice-b/helpers";

// ---------------------------------------------------------------- helpers

let sent: { connectionId: string; message: any }[] = [];
let goneIds = new Set<string>();
beforeEach(() => {
  sent = [];
  goneIds = new Set();
  setSender(async (connectionId, message): Promise<SendResult> => {
    if (goneIds.has(connectionId)) return "gone";
    sent.push({ connectionId, message });
    return "sent";
  });
});
afterEach(() => setSender(null));

let connCounter = 0;
const wsEvent = (connectionId: string, opts: Partial<WsEvent> = {}): WsEvent => ({
  requestContext: { connectionId, routeKey: "$default" },
  ...opts,
});

/** Connect a user and report a location; returns the connection id. */
async function phone(token: string, at: { lat: number; lng: number }): Promise<string> {
  const id = `conn-${++connCounter}-${Math.random().toString(36).slice(2, 8)}`;
  expect((await connect(wsEvent(id, { queryStringParameters: { token } }))).statusCode).toBe(200);
  const res = await location(wsEvent(id, { body: JSON.stringify({ action: "location", ...at }) }));
  expect(res.statusCode).toBe(200);
  return id;
}

const record = (eventName: DynamoDBRecord["eventName"], before?: NoteItem, after?: NoteItem): DynamoDBRecord => ({
  eventName,
  eventID: `ev-${Math.random()}`,
  dynamodb: {
    OldImage: before ? (marshall(before, { removeUndefinedValues: true }) as any) : undefined,
    NewImage: after ? (marshall(after, { removeUndefinedValues: true }) as any) : undefined,
  },
});
const stream = (...records: DynamoDBRecord[]): DynamoDBStreamEvent => ({ Records: records });
const insert = (n: NoteItem) => stream(record("INSERT", undefined, n));
const to = (id: string) => sent.filter((s) => s.connectionId === id).map((s) => s.message);

async function getConn(id: string) {
  return (await ddb.send(new GetCommand({ TableName: config.tableName, Key: connKey(id), ConsistentRead: true }))).Item;
}

// ---------------------------------------------------------------- A-9: connect / location / disconnect

describe("WebSocket connect / location / disconnect (A-9)", () => {
  it("valid token → 200 and the connection is saved; it joins the geo index after a location", async () => {
    const u = await createUser(uniqueName("wsc"));
    const spot = freshSpot();
    const id = "conn-save-" + Math.random().toString(36).slice(2);
    expect((await connect(wsEvent(id, { queryStringParameters: { token: u.token } }))).statusCode).toBe(200);
    const saved = await getConn(id);
    expect(saved).toMatchObject({ connectionId: id, username: u.username });
    expect(saved?.gsi1pk).toBeUndefined(); // not findable until we know where it is
    expect(saved?.expiresAt).toBeGreaterThan(Date.now() / 1000);

    await location(wsEvent(id, { body: JSON.stringify({ action: "location", ...spot }) }));
    expect((await getConn(id))?.gsi1pk).toMatch(/^WSCELL#/);
    expect((await connectionsNear(spot.lat, spot.lng)).map((c) => c.connectionId)).toContain(id);
  });

  it.each([
    ["no token", undefined],
    ["bad token", { token: "nope" }],
  ])("%s → 401, nothing saved", async (_label, qs) => {
    const id = "conn-bad-" + Math.random().toString(36).slice(2);
    expect((await connect(wsEvent(id, { queryStringParameters: qs }))).statusCode).toBe(401);
    expect(await getConn(id)).toBeUndefined();
  });

  it.each([
    ["not JSON", "hello"],
    ["missing lng", JSON.stringify({ action: "location", lat: 1 })],
    ["lat out of range", JSON.stringify({ action: "location", lat: 91, lng: 0 })],
  ])("location message %s → 400", async (_label, body) => {
    const u = await createUser(uniqueName("wsl"));
    const id = await phone(u.token, freshSpot());
    expect((await location(wsEvent(id, { body }))).statusCode).toBe(400);
  });

  it("location for an unknown connection → 410 and nothing is created", async () => {
    const res = await location(wsEvent("conn-ghost", { body: JSON.stringify({ action: "location", lat: 1, lng: 1 }) }));
    expect(res.statusCode).toBe(410);
    expect(await getConn("conn-ghost")).toBeUndefined();
  });

  it("disconnect deletes the connection", async () => {
    const u = await createUser(uniqueName("wsd"));
    const spot = freshSpot();
    const id = await phone(u.token, spot);
    expect((await disconnect(wsEvent(id))).statusCode).toBe(200);
    expect(await getConn(id)).toBeUndefined();
    expect((await connectionsNear(spot.lat, spot.lng)).map((c) => c.connectionId)).not.toContain(id);
  });
});

// ---------------------------------------------------------------- A-10: notify

describe("notify: note_nearby (A-10)", () => {
  it("new public note → pushed to readers within 100 m, with distance; not to readers farther away", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("nau"));
    const near = await createUser(uniqueName("nne"));
    const far = await createUser(uniqueName("nfa"));
    const nearId = await phone(near.token, offsetMeters(spot.lat, spot.lng, 60, 0));
    const farId = await phone(far.token, offsetMeters(spot.lat, spot.lng, 140, 0)); // neighbouring cell, too far
    const note = await createNoteDirect(author.username, { ...spot, text: "secret text" });

    await notify(insert(note));

    expect(to(nearId)).toEqual([
      {
        type: "note_nearby",
        note: expect.objectContaining({ id: note.id, authorName: author.username, visibility: "public", distanceM: 60 }),
      },
    ]);
    expect(JSON.stringify(to(nearId))).not.toContain("secret text"); // the text is only ever sent by /open
    expect(to(farId)).toEqual([]);
  });

  it("anonymous note → authorName null; the author's own phone gets nothing", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("nan"));
    const reader = await createUser(uniqueName("nar"));
    const authorId = await phone(author.token, spot);
    const readerId = await phone(reader.token, spot);
    const note = await createNoteDirect(author.username, { ...spot, anonymous: true });

    await notify(insert(note));

    expect(to(readerId)).toHaveLength(1);
    expect(to(readerId)[0].note.authorName).toBeNull();
    expect(to(authorId)).toEqual([]);
  });

  it("group note → only members' phones", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("ngr"));
    const member = await createUser(uniqueName("ngm"));
    const outsider = await createUser(uniqueName("ngo"));
    const g = parse(await createGroup(makeEvent({ token: author.token, body: { name: "crew" } }))).body;
    const { handler: join } = await import("../../src/groups/join");
    await join(makeEvent({ token: member.token, body: { joinCode: g.joinCode } }));
    const memberId = await phone(member.token, spot);
    const outsiderId = await phone(outsider.token, spot);
    const note = await createNoteDirect(author.username, { ...spot, visibility: "group", groupId: g.groupId });

    await notify(insert(note));

    expect(to(memberId).map((m) => m.note.id)).toEqual([note.id]);
    expect(to(outsiderId)).toEqual([]);
  });

  it("a phone that moved away after reporting gets nothing for notes at its old spot's edge", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("nmv"));
    const reader = await createUser(uniqueName("nmr"));
    const id = await phone(reader.token, spot);
    const moved = offsetMeters(spot.lat, spot.lng, 400, 0);
    await location(wsEvent(id, { body: JSON.stringify({ action: "location", ...moved }) }));
    await notify(insert(await createNoteDirect(author.username, spot)));
    expect(to(id)).toEqual([]);
  });

  it("a connection that's gone is deleted and doesn't stop the others", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("ngn"));
    const a = await createUser(uniqueName("nga"));
    const b = await createUser(uniqueName("ngb"));
    const goneId = await phone(a.token, spot);
    const liveId = await phone(b.token, spot);
    goneIds.add(goneId);

    await notify(insert(await createNoteDirect(author.username, spot)));

    expect(to(liveId)).toHaveLength(1);
    expect(await getConn(goneId)).toBeUndefined();
  });

  it("a sender error is logged and skipped; other connections and records still go out", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("ner"));
    const a = await createUser(uniqueName("nea"));
    const b = await createUser(uniqueName("neb"));
    const badId = await phone(a.token, spot);
    const okId = await phone(b.token, spot);
    setSender(async (connectionId, message) => {
      if (connectionId === badId) throw new Error("boom");
      sent.push({ connectionId, message });
      return "sent";
    });
    const n1 = await createNoteDirect(author.username, spot);
    const n2 = await createNoteDirect(author.username, spot);
    await notify(stream(record("INSERT", undefined, n1), record("INSERT", undefined, n2)));
    expect(to(okId).map((m) => m.note.id)).toEqual([n1.id, n2.id]);
    expect(await getConn(badId)).toBeDefined(); // an error isn't "gone": keep it
  });
});

describe("notify: note_gone (A-10)", () => {
  it("consumed or recalled → note_gone to nearby phones (the author's too); text never sent", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("gau"));
    const reader = await createUser(uniqueName("gre"));
    const authorId = await phone(author.token, spot);
    const readerId = await phone(reader.token, offsetMeters(spot.lat, spot.lng, 30, 0));
    const note = await createNoteDirect(author.username, spot);
    const { gsi1pk: _a, gsi1sk: _b, ...rest } = note;

    await notify(stream(record("MODIFY", note, { ...rest, status: "consumed", consumedBy: reader.username })));
    expect(to(readerId)).toEqual([{ type: "note_gone", id: note.id }]);
    expect(to(authorId)).toEqual([{ type: "note_gone", id: note.id }]);

    sent = [];
    await notify(stream(record("MODIFY", note, { ...rest, status: "recalled" }), record("REMOVE", note, undefined)));
    expect(to(readerId)).toEqual([
      { type: "note_gone", id: note.id },
      { type: "note_gone", id: note.id },
    ]);
  });

  it("group note gone → only members are told", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("gga"));
    const outsider = await createUser(uniqueName("ggo"));
    const g = parse(await createGroup(makeEvent({ token: author.token, body: { name: "crew" } }))).body;
    const outsiderId = await phone(outsider.token, spot);
    const authorId = await phone(author.token, spot);
    const note = await createNoteDirect(author.username, { ...spot, visibility: "group", groupId: g.groupId });
    await notify(stream(record("MODIFY", note, { ...note, status: "recalled" })));
    expect(to(outsiderId)).toEqual([]);
    expect(to(authorId)).toEqual([{ type: "note_gone", id: note.id }]);
  });

  it("ignores changes that aren't note appear/disappear, and non-note items", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("gig"));
    const reader = await createUser(uniqueName("gir"));
    const readerId = await phone(reader.token, spot);
    const note = await createNoteDirect(author.username, spot);
    const consumed = { ...note, status: "consumed" as const };
    await notify(
      stream(
        record("MODIFY", note, { ...note, text: "edited" }), // still active
        record("MODIFY", consumed, { ...consumed, consumedAt: "x" }), // still gone
        record("REMOVE", consumed, undefined), // was already gone
        { eventName: "INSERT", dynamodb: { NewImage: marshall({ PK: `USER#${reader.username}`, SK: "PROFILE" }) as any } },
      ),
    );
    expect(to(readerId)).toEqual([]);
  });
});
