// OWNER: Vincent. L-1: p50 / p95 latency for every implemented endpoint, measured over HTTP against
// the local API (Express → Lambda handlers → DynamoDB Local). Sequential requests, 10 warm-up calls each.
// Needs the API running: npm run dev:api:quiet

import { config } from "../../src/shared/config";
import { offsetMeters } from "../../src/shared/geo";
import { createNoteDirect, createUser, uniqueName } from "../lib/fixtures";
import { ensureServer, request } from "../lib/http";
import { mdTable, writeCsv, writeSummary } from "../lib/report";
import { summarize } from "../lib/stats";

const WARMUP = 10;
const c = config.demoCenter;
type Call = () => Promise<{ status: number; ms: number }>;

interface Spec {
  endpoint: string;
  n: number;
  prepare: (count: number) => Promise<Call[]>; // one call per sample (+ warm-up)
}

await ensureServer();

// a user with notes around a fresh spot, so nearby/open have realistic work to do
const spot = offsetMeters(c.lat, c.lng, 5_000, 5_000);
const reader = await createUser(uniqueName("latr"));
const noteAuthor = await createUser(uniqueName("lata"));
const nearbyNotes = [];
for (let i = 0; i < 10; i++) nearbyNotes.push(await createNoteDirect(noteAuthor.username, offsetMeters(spot.lat, spot.lng, i * 7, -i * 5)));
const openTarget = nearbyNotes[0];
const loginUser = uniqueName("latl");
await request("POST", "/auth/register", { body: { username: loginUser, password: "password123" } });

const noteBody = { text: "latency test", lat: spot.lat, lng: spot.lng, visibility: "public", anonymous: false, burnOnRead: false };

const specs: Spec[] = [
  {
    endpoint: "POST /auth/register",
    n: 30,
    prepare: async (k) =>
      Array.from({ length: k }, () => () => request("POST", "/auth/register", { body: { username: uniqueName("latg"), password: "password123" } })),
  },
  {
    endpoint: "POST /auth/login",
    n: 30,
    prepare: async (k) =>
      Array.from({ length: k }, () => () => request("POST", "/auth/login", { body: { username: loginUser, password: "password123" } })),
  },
  { endpoint: "GET /me", n: 200, prepare: async (k) => Array.from({ length: k }, () => () => request("GET", "/me", { token: reader.token })) },
  {
    endpoint: "POST /notes",
    n: 200,
    prepare: async (k) => {
      // 5 notes per user so we never hit the N = 5 limit
      const users = await Promise.all(Array.from({ length: Math.ceil(k / 5) }, () => createUser(uniqueName("latw"))));
      return Array.from({ length: k }, (_, i) => () => request("POST", "/notes", { token: users[Math.floor(i / 5)].token, body: noteBody }));
    },
  },
  {
    endpoint: "GET /notes/mine",
    n: 200,
    prepare: async (k) => Array.from({ length: k }, () => () => request("GET", "/notes/mine", { token: noteAuthor.token })),
  },
  {
    endpoint: "GET /notes/nearby",
    n: 200,
    prepare: async (k) =>
      Array.from({ length: k }, () => () => request("GET", `/notes/nearby?lat=${spot.lat}&lng=${spot.lng}`, { token: reader.token })),
  },
  {
    endpoint: "POST /notes/{id}/open",
    n: 200,
    prepare: async (k) =>
      Array.from({ length: k }, () => () => request("POST", `/notes/${openTarget.id}/open`, { token: reader.token, body: spot })),
  },
  {
    endpoint: "DELETE /notes/{id}",
    n: 200,
    prepare: async (k) => {
      const owner = await createUser(uniqueName("latd"));
      const notes = [];
      for (let i = 0; i < k; i++) notes.push(await createNoteDirect(owner.username, spot));
      return notes.map((note) => () => request("DELETE", `/notes/${note.id}`, { token: owner.token }));
    },
  },
];

const samples: Record<string, string | number>[] = [];
const summary: Record<string, string | number>[] = [];

for (const spec of specs) {
  const calls = await spec.prepare(spec.n + WARMUP);
  const ms: number[] = [];
  let errors = 0;
  let notImplemented = false;
  for (let i = 0; i < calls.length; i++) {
    const r = await calls[i]();
    if (r.status === 501) notImplemented = true;
    if (i < WARMUP) continue;
    if (r.status >= 400) errors++;
    ms.push(r.ms);
    samples.push({ endpoint: spec.endpoint, i: i - WARMUP + 1, status: r.status, ms: Math.round(r.ms * 100) / 100 });
  }
  if (notImplemented) {
    summary.push({ endpoint: spec.endpoint, n: "-", "p50 ms": "not implemented", "p95 ms": "-", "mean ms": "-", "max ms": "-", errors: "-" });
    console.log(`${spec.endpoint.padEnd(24)} not implemented (501)`);
    continue;
  }
  const s = summarize(ms);
  summary.push({ endpoint: spec.endpoint, n: s.n, "p50 ms": s.p50, "p95 ms": s.p95, "mean ms": s.mean, "max ms": s.max, errors });
  console.log(`${spec.endpoint.padEnd(24)} n=${s.n} p50=${s.p50} ms p95=${s.p95} ms errors=${errors}`);
}

writeCsv("latency-samples.csv", samples);
writeSummary(
  "latency-summary.md",
  "L-1: endpoint latency (local)",
  [
    "",
    `**Setup:** each endpoint called sequentially over HTTP (${WARMUP} warm-up calls not counted) against the local API: Express → the real Lambda handlers → DynamoDB Local in Docker, all on one laptop. Times are measured by the client (full round trip).`,
    "",
    mdTable(summary),
    "",
    "**Notes:**",
    `- Register and login are the slowest because they hash or verify the password with bcrypt (cost ${config.bcryptCost}), which is deliberately slow to protect passwords.`,
    "- `POST /notes` and `DELETE /notes/{id}` run a DynamoDB transaction (note + slot counter together).",
    "- `GET /notes/nearby` runs 9 geohash cell queries in parallel and then the exact distance check.",
    "- These are local numbers (no network between client, server and database). On AWS expect higher absolute values (network + Lambda), so use them to compare endpoints with each other, not as production latency.",
    "",
    "**Suggested chart:** horizontal bar chart of p50 with p95 as an error bar or second bar, one bar per endpoint.",
  ].join("\n"),
);
