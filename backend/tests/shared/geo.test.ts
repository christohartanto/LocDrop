import { describe, expect, it } from "vitest";
import { config } from "../../src/shared/config";
import { cellBounds, cellsToSearch, distanceM, encode } from "../../src/shared/geo";

const c = config.demoCenter;

describe("geo", () => {
  it("distanceM: 0.001° latitude ≈ 111.2 m", () => {
    expect(Math.abs(distanceM(c.lat, c.lng, c.lat + 0.001, c.lng) - 111.2)).toBeLessThan(1);
  });

  it("encode returns a 7-character geohash", () => {
    expect(encode(c.lat, c.lng)).toHaveLength(7);
  });

  it("cellsToSearch returns 9 unique cells including the caller's own", () => {
    const cells = cellsToSearch(c.lat, c.lng);
    expect(cells).toHaveLength(9);
    expect(new Set(cells).size).toBe(9);
    expect(cells).toContain(encode(c.lat, c.lng));
  });

  it("edge: a note 1 m across the east edge is in a different cell but still searched", () => {
    const b = cellBounds(encode(c.lat, c.lng));
    const midLat = (b.minLat + b.maxLat) / 2;
    const oneMeterLng = 1 / (111_320 * Math.cos((midLat * Math.PI) / 180));
    const reader = { lat: midLat, lng: b.maxLng - oneMeterLng };
    const note = { lat: midLat, lng: b.maxLng + oneMeterLng };
    expect(encode(note.lat, note.lng)).not.toBe(encode(reader.lat, reader.lng));
    expect(cellsToSearch(reader.lat, reader.lng)).toContain(encode(note.lat, note.lng));
    expect(distanceM(reader.lat, reader.lng, note.lat, note.lng)).toBeLessThan(3);
  });

  it("corner: a note 1 m across the north-east corner (diagonal neighbour) is still searched", () => {
    const b = cellBounds(encode(c.lat, c.lng));
    const oneMeterLat = 1 / 111_320;
    const oneMeterLng = 1 / (111_320 * Math.cos((b.maxLat * Math.PI) / 180));
    const reader = { lat: b.maxLat - oneMeterLat, lng: b.maxLng - oneMeterLng };
    const note = { lat: b.maxLat + oneMeterLat, lng: b.maxLng + oneMeterLng };
    expect(encode(note.lat, note.lng)).not.toBe(encode(reader.lat, reader.lng));
    expect(cellsToSearch(reader.lat, reader.lng)).toContain(encode(note.lat, note.lng));
  });
});
