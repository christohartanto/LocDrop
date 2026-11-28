// OWNER: Vincent. L-1: p50 / p95 latency for every implemented endpoint, measured over HTTP against
// the local API (Express → Lambda handlers → DynamoDB Local). Sequential requests, 10 warm-up calls each.
// Also live pop-ups (A-10): time from POST /notes until note_nearby arrives on a connected WebSocket,
// and from DELETE until note_gone arrives.
// Needs the API running: npm run dev:api:quiet

import { config } from "../../src/shared/config";
import { offsetMeters } from "../../src/shared/geo";
import { createNoteDirect, createUser, uniqueName } from "../lib/fixtures";
import WebSocket from "ws";
import { API_URL, ensureServer, request } from "../lib/http";
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
    endpoint: "POST /groups",
    n: 200,
    prepare: async (k) => Array.from({ length: k }, () => () => request("POST", "/groups", { token: reader.token, body: { name: "latency" } })),
  },
  {
    endpoint: "POST /groups/join",
    n: 200,
    prepare: async (k) => {
      const owner = await createUser(uniqueName("latj"));
      const res = (await request("POST", "/groups", { token: owner.token, body: { name: "latency join" } })).body;
      const joiners = await Promise.all(Array.from({ length: k }, () => createUser(uniqueName("latj"))));
      return joiners.map((u) => () => request("POST", "/groups/join", { token: u.token, body: { joinCode: res.joinCode } }));
    },
  },
  // reader is in ~210 groups by now (POST /groups above), a realistic worst case for one Query
  { endpoint: "GET /groups", n: 200, prepare: async (k) => Array.from({ length: k }, () => () => request("GET", "/groups", { token: reader.token })) },
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

// ---------------------------------------------------------------- live pop-ups (A-10)
const POPUP_N = 50;
const popSpot = offsetMeters(c.lat, c.lng, -5_000, 5_000);
const popReader = await createUser(uniqueName("latp"));
const popAuthor = await createUser(uniqueName("latq"));
const ws = await new Promise<WebSocket>((resolve, reject) => {
  const sock = new WebSocket(`${API_URL.replace(/^http/, "ws")}/?token=${encodeURIComponent(popReader.token)}`);
  sock.once("open", () => resolve(sock));
  sock.once("error", reject);
});
ws.send(JSON.stringify({ action: "location", ...popSpot }));
await new Promise((r) => setTimeout(r, 1000));

function waitFor(match: (m: any) => boolean, timeoutMs = 10_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMsg);
      reject(new Error("timeout"));
    }, timeoutMs);
    const onMsg = (data: WebSocket.RawData) => {
      const m = JSON.parse(data.toString());
      if (!match(m)) return;
      clearTimeout(timer);
      ws.off("message", onMsg);
      resolve(performance.now());
    };
    ws.on("message", onMsg);
  });
}

const nearbyMs: number[] = [];
const goneMs: number[] = [];
let popErrors = 0;
for (let i = 0; i < POPUP_N + 3; i++) {
  // drop a note 20 m from the reader and time the pop-up
  const started = performance.now();
  const created = await request("POST", "/notes", {
    token: popAuthor.token,
    body: { ...noteBody, ...offsetMeters(popSpot.lat, popSpot.lng, 20, 0) },
  });
  const id = created.body?.id as string;
  const arrived = await waitFor((m) => m.type === "note_nearby" && m.note?.id === id).catch(() => null);
  // recall it (frees the slot) and time the removal
  const recallStarted = performance.now();
  const gone = waitFor((m) => m.type === "note_gone" && m.id === id).catch(() => null);
  await request("DELETE", `/notes/${id}`, { token: popAuthor.token });
  const goneAt = await gone;
  if (i < 3) continue; // warm-up
  if (arrived === null || goneAt === null) popErrors++;
  if (arrived !== null) {
    nearbyMs.push(arrived - started);
    samples.push({ endpoint: "pop-up: note_nearby", i: i - 2, status: 200, ms: Math.round((arrived - started) * 100) / 100 });
  }
  if (goneAt !== null) {
    goneMs.push(goneAt - recallStarted);
    samples.push({ endpoint: "pop-up: note_gone", i: i - 2, status: 200, ms: Math.round((goneAt - recallStarted) * 100) / 100 });
  }
}
ws.close();
for (const [name, ms] of [
  ["pop-up: POST /notes → note_nearby", nearbyMs],
  ["pop-up: DELETE → note_gone", goneMs],
] as const) {
  const st = summarize([...ms]);
  summary.push({ endpoint: name, n: st.n, "p50 ms": st.p50, "p95 ms": st.p95, "mean ms": st.mean, "max ms": st.max, errors: popErrors });
  console.log(`${name.padEnd(34)} n=${st.n} p50=${st.p50} ms p95=${st.p95} ms`);
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
    "- `POST /groups` runs a 3-item transaction (group + unique join code + membership); `GET /groups` is one query (the caller is in ~210 groups by then, a worst case).",
    `- **Pop-up rows** (A-10) time the whole path: the HTTP write, the table's change stream, \`notify\`, and the WebSocket message to a phone 20 m away (n = ${POPUP_N}, 3 warm-up). Locally the dev server reads DynamoDB Local's stream every 0.4 s, so most of that time is waiting for the next read. On AWS, Lambda reads the stream instead: \`npm run smoke:live -- --aws\` measured about 0.45–0.8 s warm (2.6 s on the first, cold run).`,
    "- These are local numbers (no network between client, server and database). On AWS expect higher absolute values (network + Lambda), so use them to compare endpoints with each other, not as production latency.",
    "",
    "**Suggested chart:** horizontal bar chart of p50 with p95 as an error bar or second bar, one bar per endpoint.",
  ].join("\n"),
);
