import { describe, expect, it } from "vitest";
import { createNoteDirect, createUser, getNote, getUser, uniqueName } from "../../bench/lib/fixtures";
import { handler as open } from "../../src/notes-read/open";
import { handler as recall } from "../../src/notes-lifecycle/recall";
import { freshSpot, makeEvent, parse } from "./helpers";

describe("DELETE /notes/{id} recall (B-6)", () => {
  it("author recalls → 204, note recalled, slot released", async () => {
    const author = await createUser(uniqueName("auth"));
    const note = await createNoteDirect(author.username, { ...freshSpot() });
    const res = await recall(makeEvent({ token: author.token, id: note.id }));
    expect(res.statusCode).toBe(204);
    const after = await getNote(note.id);
    expect(after?.status).toBe("recalled");
    expect(after?.recalledAt).toBeTruthy();
    expect(after?.gsi1pk).toBeUndefined();
    expect((await getUser(author.username))?.activeNoteCount).toBe(0);
  });

  it("someone else → 404; unknown id → 404", async () => {
    const author = await createUser(uniqueName("auth"));
    const other = await createUser(uniqueName("othr"));
    const note = await createNoteDirect(author.username, { ...freshSpot() });
    expect(parse(await recall(makeEvent({ token: other.token, id: note.id }))).status).toBe(404);
    expect(parse(await recall(makeEvent({ token: author.token, id: "nope" }))).status).toBe(404);
    expect((await getNote(note.id))?.status).toBe("active");
  });

  it("recall twice → second is 410 NOTE_GONE; slot released only once", async () => {
    const author = await createUser(uniqueName("auth"));
    await createNoteDirect(author.username, { ...freshSpot() }); // keeps count at 1 after the recall
    const note = await createNoteDirect(author.username, { ...freshSpot() });
    expect((await recall(makeEvent({ token: author.token, id: note.id }))).statusCode).toBe(204);
    const again = parse(await recall(makeEvent({ token: author.token, id: note.id })));
    expect(again.status).toBe(410);
    expect(again.body.error.code).toBe("NOTE_GONE");
    expect((await getUser(author.username))?.activeNoteCount).toBe(1);
  });

  it("recall vs first reader at the same moment → exactly one wins, slot released once", async () => {
    const spot = freshSpot();
    const author = await createUser(uniqueName("auth"));
    const readers = await Promise.all(Array.from({ length: 5 }, () => createUser(uniqueName("read"))));
    const note = await createNoteDirect(author.username, { ...spot, burnOnRead: true });

    const [recallRes, ...openRes] = await Promise.all([
      recall(makeEvent({ token: author.token, id: note.id })),
      ...readers.map((r) => open(makeEvent({ token: r.token, id: note.id, body: spot }))),
    ]);
    const winners = [recallRes.statusCode === 204, ...openRes.map((r) => r.statusCode === 200)].filter(Boolean);
    expect(winners).toHaveLength(1);
    expect((await getUser(author.username))?.activeNoteCount).toBe(0);
  });
});
