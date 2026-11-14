// OWNER: Wendy. B-8 benchmark: nearby lookup, geohash 9-cell query vs full-table scan,
// at growing table sizes. Runs against its own table (TABLE_NAME=LocDropBench via the npm script).
// Calls query.ts directly (no HTTP server needed).

import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { createTable } from "../../scripts/lib/table";
import { config } from "../../src/shared/config";
import { ddb, sleep } from "../../src/shared/db";
import { encode, offsetMeters } from "../../src/shared/geo";
import { noteIndexAttrs, noteKey } from "../../src/shared/keys";
import type { NoteItem } from "../../src/shared/model";
import { findNearbyByGeohash, findNearbyByScan } from "../../src/notes-read/query";
import { mdTable, writeCsv, writeSummary } from "../lib/report";
import { seededRandom, summarize } from "../lib/stats";

if (config.tableName !== "LocDropBench") {
  console.error(`Refusing to run on table "${config.tableName}". Use: npm run bench:b8`);
  process.exit(1);
}

const SIZES = (process.env.SIZES ?? "1000,10000,50000").split(",").map(Number);
const POINTS = Number(process.env.POINTS ?? 30);
const BOX_M = 10_000; // notes spread uniformly over a 10 km x 10 km box around the demo center
const center = config.demoCenter;

const randNotes = seededRandom(42);
const randPoints = seededRandom(7);
const randomSpot = (rand: () => number) =>
  offsetMeters(center.lat, center.lng, (rand() - 0.5) * BOX_M, (rand() - 0.5) * BOX_M);

let noteCounter = 0;
function makeNote(): NoteItem {
  const id = `b8-${++noteCounter}`;
  const { lat, lng } = randomSpot(randNotes);
  const geohash = encode(lat, lng);
  const createdAt = new Date(Date.UTC(2026, 0, 1) + noteCounter * 1000).toISOString();
  return {
    ...noteKey(id),
    SK: "META",
    id,
    authorUsername: `bench${noteCounter % 500}`,
    text: "benchmark note",
    lat,
    lng,
    geohash,
    visibility: "public",
    anonymous: false,
    burnOnRead: false,
    status: "active",
    createdAt,
    ...noteIndexAttrs({ id, geohash, authorUsername: `bench${noteCounter % 500}`, createdAt }),
  };
}

async function writeBatch(items: NoteItem[]): Promise<void> {
  let requests = items.map((Item) => ({ PutRequest: { Item } }));
  for (let attempt = 1; requests.length > 0; attempt++) {
    const res = await ddb.send(new BatchWriteCommand({ RequestItems: { [config.tableName]: requests } }));
    requests = (res.UnprocessedItems?.[config.tableName] ?? []) as typeof requests;
    if (requests.length > 0) await sleep(Math.min(1000, 20 * attempt));
  }
}

async function seedUpTo(target: number): Promise<void> {
  const started = performance.now();
  const before = noteCounter;
  const toAdd = target - noteCounter;
  const batches: NoteItem[][] = [];
  for (let i = 0; i < toAdd; i += 25) batches.push(Array.from({ length: Math.min(25, toAdd - i) }, makeNote));
  const PARALLEL = 8;
  for (let i = 0; i < batches.length; i += PARALLEL) {
    await Promise.all(batches.slice(i, i + PARALLEL).map(writeBatch));
    if ((i / PARALLEL) % 50 === 0) process.stdout.write(`\r  seeded ${before + Math.min((i + PARALLEL) * 25, toAdd)} / ${target}`);
  }
  console.log(`\r  seeded ${target} notes (+${toAdd}) in ${((performance.now() - started) / 1000).toFixed(1)} s`);
}

const totalStart = performance.now();
console.log(`B-8: resetting table ${config.tableName}`);
await createTable(config.tableName, { reset: true });

const points = Array.from({ length: POINTS }, () => randomSpot(randPoints));
const rows: Record<string, string | number | boolean>[] = [];
const summaryRows: Record<string, string | number | boolean>[] = [];

for (const size of SIZES) {
  console.log(`\nTable size ${size}:`);
  await seedUpTo(size);

  for (const method of ["geohash", "scan"] as const) {
    const started = performance.now();
    const lat: number[] = [];
    const examined: number[] = [];
    const returned: number[] = [];
    let mismatches = 0;

    for (let p = 0; p < points.length; p++) {
      const { lat: qLat, lng: qLng } = points[p];
      const t0 = performance.now();
      const res = method === "geohash" ? await findNearbyByGeohash(qLat, qLng) : await findNearbyByScan(qLat, qLng);
      const ms = performance.now() - t0;

      // correctness: both methods must return the same notes
      const other = method === "geohash" ? null : await findNearbyByGeohash(qLat, qLng);
      const mismatch =
        other !== null &&
        JSON.stringify(res.items.map((x) => x.note.id).sort()) !== JSON.stringify(other.items.map((x) => x.note.id).sort());
      if (mismatch) mismatches++;

      lat.push(ms);
      examined.push(res.examined);
      returned.push(res.items.length);
      rows.push({
        size,
        method,
        point: p + 1,
        latencyMs: Math.round(ms * 100) / 100,
        examined: res.examined,
        returned: res.items.length,
        mismatch,
      });
    }

    const l = summarize(lat);
    summaryRows.push({
      size,
      method,
      "p50 ms": l.p50,
      "p95 ms": l.p95,
      "mean examined": summarize(examined).mean,
      "mean returned": summarize(returned).mean,
      mismatches,
    });
    console.log(
      `  ${method.padEnd(7)} p50 ${l.p50} ms, p95 ${l.p95} ms, examined ~${summarize(examined).mean}, returned ~${summarize(returned).mean}, mismatches ${mismatches} (${((performance.now() - started) / 1000).toFixed(1)} s)`,
    );
  }
}

writeCsv("b8-queries.csv", rows);

const totalMismatches = summaryRows.reduce((s, r) => s + Number(r.mismatches), 0);
writeSummary(
  "b8-summary.md",
  "B-8: nearby lookup, geohash 9-cell query vs full-table scan",
  [
    "",
    `**Setup:** notes spread uniformly over a 10 km × 10 km area around the demo center. At each table size (${SIZES.join(" / ")}), ${POINTS} random query points; each point is queried with both methods. Read radius ${config.readRadiusM} m, geohash precision ${config.geohashPrecision} (cell ≈ 153 m × 153 m), 9 cells per query.`,
    "",
    mdTable(summaryRows),
    "",
    `**Correctness:** ${totalMismatches === 0 ? "both methods returned exactly the same notes for every query point (0 mismatches)" : `${totalMismatches} mismatches; see b8-queries.csv`}. A separate unit test (\`tests/slice-b/boundary.test.ts\`) checks notes just across a cell edge and corner are found.`,
    "",
    "**Notes:** \"examined\" = items DynamoDB had to read, which does not depend on hardware. Scan always reads the whole table, so its cost grows with total table size. Geohash reads only the notes in the 9 cells around the reader (about 0.2% of the table here), so its cost grows with how crowded that area is, not with total table size. In this test all notes sit in the same 10 km box, so a bigger table also means denser cells, which is why geohash examined rises from about 2 to about 97, while its latency stays at about 15 to 30 ms. Absolute latency is DynamoDB Local on a laptop, not AWS.",
    "",
    "**Suggested charts:** (1) p50 latency vs table size, one line per method (log scale on x); (2) mean examined items vs table size, one line per method.",
    "",
    `Total benchmark time: ${((performance.now() - totalStart) / 1000).toFixed(1)} s.`,
  ].join("\n"),
);

process.exit(totalMismatches === 0 ? 0 : 1);
