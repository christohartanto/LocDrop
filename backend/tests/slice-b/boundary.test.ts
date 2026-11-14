// B-8 correctness: notes just across a geohash cell edge must still be found.

import { describe, expect, it } from "vitest";
import { createNoteDirect, createUser, uniqueName } from "../../bench/lib/fixtures";
import { cellBounds, encode, offsetMeters } from "../../src/shared/geo";
import { findNearbyByGeohash } from "../../src/notes-read/query";
import { freshSpot } from "./helpers";

const metersToLat = (m: number) => m / 111_320;
const metersToLng = (m: number, lat: number) => m / (111_320 * Math.cos((lat * Math.PI) / 180));

describe("geohash cell boundaries (B-8)", () => {
  it("note 1 m across the east edge of the reader's cell is found", async () => {
    const author = await createUser(uniqueName("edge"));
    const spot = freshSpot();
    const b = cellBounds(encode(spot.lat, spot.lng));
    const lat = (b.minLat + b.maxLat) / 2;
    const reader = { lat, lng: b.maxLng - metersToLng(1, lat) };
    const notePos = { lat, lng: b.maxLng + metersToLng(1, lat) };
    expect(encode(notePos.lat, notePos.lng)).not.toBe(encode(reader.lat, reader.lng));

    const note = await createNoteDirect(author.username, notePos);
    const ids = (await findNearbyByGeohash(reader.lat, reader.lng)).items.map((x) => x.note.id);
    expect(ids).toContain(note.id);
  });

  it("note 1 m across the north-east corner (diagonal cell) is found", async () => {
    const author = await createUser(uniqueName("edge"));
    const spot = freshSpot();
    const b = cellBounds(encode(spot.lat, spot.lng));
    const reader = { lat: b.maxLat - metersToLat(1), lng: b.maxLng - metersToLng(1, b.maxLat) };
    const notePos = { lat: b.maxLat + metersToLat(1), lng: b.maxLng + metersToLng(1, b.maxLat) };
    expect(encode(notePos.lat, notePos.lng)).not.toBe(encode(reader.lat, reader.lng));

    const note = await createNoteDirect(author.username, notePos);
    const ids = (await findNearbyByGeohash(reader.lat, reader.lng)).items.map((x) => x.note.id);
    expect(ids).toContain(note.id);
  });

  it("radius edge: 99 m is found, 101 m is not", async () => {
    const author = await createUser(uniqueName("edge"));
    const spot = freshSpot();
    const in99 = await createNoteDirect(author.username, offsetMeters(spot.lat, spot.lng, 99, 0));
    const out101 = await createNoteDirect(author.username, offsetMeters(spot.lat, spot.lng, 0, 101));
    const ids = (await findNearbyByGeohash(spot.lat, spot.lng)).items.map((x) => x.note.id);
    expect(ids).toContain(in99.id);
    expect(ids).not.toContain(out101.id);
  });
});
