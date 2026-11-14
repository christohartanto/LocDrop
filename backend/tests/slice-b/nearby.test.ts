import { describe, expect, it } from "vitest";
import { createNoteDirect, createUser, uniqueName } from "../../bench/lib/fixtures";
import { offsetMeters } from "../../src/shared/geo";
import { handler as nearby } from "../../src/notes-read/nearby";
import { handler as open } from "../../src/notes-read/open";
import { handler as recall } from "../../src/notes-lifecycle/recall";
import { freshSpot, makeEvent, parse } from "./helpers";

const query = (p: { lat: number; lng: number }) => ({ lat: String(p.lat), lng: String(p.lng) });

describe("GET /notes/nearby (B-1, B-2, B-3)", () => {
  it("returns notes within 100 m sorted by distance, without text; hides notes 150 m away", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("auth"));
    const reader = await createUser(uniqueName("read"));
    const near = await createNoteDirect(author.username, { ...offsetMeters(spot.lat, spot.lng, 50, 0) });
    const nearest = await createNoteDirect(author.username, { ...offsetMeters(spot.lat, spot.lng, 10, 0) });
    await createNoteDirect(author.username, { ...offsetMeters(spot.lat, spot.lng, 0, 150) });

    const res = parse(await nearby(makeEvent({ token: reader.token, query: query(spot) })));
    expect(res.status).toBe(200);
    expect(res.body.notes.map((n: any) => n.id)).toEqual([nearest.id, near.id]);
    expect(res.body.notes[0].distanceM).toBe(10);
    expect(res.body.notes[0]).not.toHaveProperty("text");
    expect(res.body.notes[0].authorName).toBe(author.username);
  });

  it("anonymous notes have authorName null", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("auth"));
    const reader = await createUser(uniqueName("read"));
    await createNoteDirect(author.username, { ...spot, anonymous: true });
    const res = parse(await nearby(makeEvent({ token: reader.token, query: query(spot) })));
    expect(res.body.notes).toHaveLength(1);
    expect(res.body.notes[0].authorName).toBeNull();
  });

  it("consumed and recalled notes are not listed", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("auth"));
    const reader = await createUser(uniqueName("read"));
    const burn = await createNoteDirect(author.username, { ...spot, burnOnRead: true });
    const toRecall = await createNoteDirect(author.username, { ...spot });
    const stays = await createNoteDirect(author.username, { ...spot });

    expect(parse(await open(makeEvent({ token: reader.token, id: burn.id, body: spot }))).status).toBe(200);
    expect(parse(await recall(makeEvent({ token: author.token, id: toRecall.id }))).status).toBe(204);

    const res = parse(await nearby(makeEvent({ token: reader.token, query: query(spot) })));
    expect(res.body.notes.map((n: any) => n.id)).toEqual([stays.id]);
  });

  it("group notes: hidden from others (isMember is false for now), visible to their author", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("auth"));
    const reader = await createUser(uniqueName("read"));
    const note = await createNoteDirect(author.username, { ...spot, visibility: "group", groupId: "g1" });

    const forReader = parse(await nearby(makeEvent({ token: reader.token, query: query(spot) })));
    expect(forReader.body.notes).toHaveLength(0);
    const forAuthor = parse(await nearby(makeEvent({ token: author.token, query: query(spot) })));
    expect(forAuthor.body.notes.map((n: any) => n.id)).toEqual([note.id]);
  });

  it("missing or invalid coordinates → 400; no token → 401", async () => {
    const reader = await createUser(uniqueName("read"));
    expect(parse(await nearby(makeEvent({ token: reader.token }))).status).toBe(400);
    expect(parse(await nearby(makeEvent({ token: reader.token, query: { lat: "200", lng: "0" } }))).status).toBe(400);
    expect(parse(await nearby(makeEvent({ query: { lat: "0", lng: "0" } }))).status).toBe(401);
  });
});
