import { describe, expect, it } from "vitest";
import { createNoteDirect, createUser, getNote, getUser, uniqueName } from "../../bench/lib/fixtures";
import { offsetMeters } from "../../src/shared/geo";
import { handler as open } from "../../src/notes-read/open";
import { freshSpot, makeEvent, parse } from "./helpers";

describe("POST /notes/{id}/open (B-4)", () => {
  it("in range → 200 with text; note stays active", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("auth"));
    const reader = await createUser(uniqueName("read"));
    const note = await createNoteDirect(author.username, { ...spot, text: "hello there" });
    const res = parse(await open(makeEvent({ token: reader.token, id: note.id, body: offsetMeters(spot.lat, spot.lng, 30, 0) })));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: note.id, text: "hello there", consumedByThisRead: false, distanceM: 30 });
    expect((await getNote(note.id))?.status).toBe("active");
  });

  it("too far → 403 OUT_OF_RANGE", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("auth"));
    const reader = await createUser(uniqueName("read"));
    const note = await createNoteDirect(author.username, { ...spot });
    const res = parse(await open(makeEvent({ token: reader.token, id: note.id, body: offsetMeters(spot.lat, spot.lng, 150, 0) })));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("OUT_OF_RANGE");
  });

  it("unknown note, or another user's group note → 404 NOT_FOUND", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("auth"));
    const reader = await createUser(uniqueName("read"));
    const groupNote = await createNoteDirect(author.username, { ...spot, visibility: "group", groupId: "g1" });
    expect(parse(await open(makeEvent({ token: reader.token, id: "nope", body: spot }))).body.error.code).toBe("NOT_FOUND");
    expect(parse(await open(makeEvent({ token: reader.token, id: groupNote.id, body: spot }))).status).toBe(404);
  });

  it("bad body → 400 VALIDATION_ERROR", async () => {
    const reader = await createUser(uniqueName("read"));
    const res = parse(await open(makeEvent({ token: reader.token, id: "x", body: { lat: "a" } })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("first-reader rule (B-5)", () => {
  it("first reader wins; second gets 410; author's slot released exactly once", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("auth"));
    const r1 = await createUser(uniqueName("read"));
    const r2 = await createUser(uniqueName("read"));
    const note = await createNoteDirect(author.username, { ...spot, burnOnRead: true, text: "secret" });
    expect((await getUser(author.username))?.activeNoteCount).toBe(1);

    const first = parse(await open(makeEvent({ token: r1.token, id: note.id, body: spot })));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ text: "secret", consumedByThisRead: true });

    const second = parse(await open(makeEvent({ token: r2.token, id: note.id, body: spot })));
    expect(second.status).toBe(410);
    expect(second.body.error.code).toBe("NOTE_GONE");

    const after = await getNote(note.id);
    expect(after?.status).toBe("consumed");
    expect(after?.consumedBy).toBe(r1.username);
    expect(after?.gsi1pk).toBeUndefined();
    expect((await getUser(author.username))?.activeNoteCount).toBe(0);
  });

  it("the author opening their own burn note does not consume it", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("auth"));
    const note = await createNoteDirect(author.username, { ...spot, burnOnRead: true });
    const res = parse(await open(makeEvent({ token: author.token, id: note.id, body: spot })));
    expect(res.status).toBe(200);
    expect(res.body.consumedByThisRead).toBe(false);
    expect((await getNote(note.id))?.status).toBe("active");
    expect((await getUser(author.username))?.activeNoteCount).toBe(1);
  });

  it("10 readers at the same moment → exactly one gets the text", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("auth"));
    const readers = await Promise.all(Array.from({ length: 10 }, () => createUser(uniqueName("read"))));
    const note = await createNoteDirect(author.username, { ...spot, burnOnRead: true });

    const results = (await Promise.all(readers.map((r) => open(makeEvent({ token: r.token, id: note.id, body: spot }))))).map(parse);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 410)).toHaveLength(9);
    expect((await getUser(author.username))?.activeNoteCount).toBe(0);
  });
});
