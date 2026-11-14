// OWNER: Vincent. A-8 benchmark: the N-note limit under concurrency.
// One user sends 50 "write note" requests at the same moment, N = 5, 20 runs, for two versions:
//   conditional: POST /notes            (slot reservation + note write in one conditional transaction)
//   naive:       POST /dev/naive/notes  (read count, check, write note, SET count+1; no conditions)
// Expected: conditional = exactly 5 successes every run; naive = more than 5 (the limit breaks).
// Needs the API running: npm run dev:api:quiet   (set NAIVE_DELAY_MS on the API to simulate a network gap)

import { config } from "../../src/shared/config";
import { countActiveNotes, createUser, getUser, uniqueName } from "../lib/fixtures";
import { ensureServer, request } from "../lib/http";
import { mdTable, writeCsv, writeSummary } from "../lib/report";
import { summarize } from "../lib/stats";

const RUNS = Number(process.env.RUNS ?? 20);
const REQUESTS = Number(process.env.REQUESTS ?? 50);
const N = config.maxActiveNotes;
const MODES = [
  { mode: "conditional", path: "/notes" },
  { mode: "naive", path: "/dev/naive/notes" },
] as const;

await ensureServer();
const health = await fetch(`${process.env.API_URL ?? "http://localhost:3000"}/dev/naive/notes`, { method: "POST" });
if (health.status === 404) {
  console.error("The dev-only naive route is not mounted. Start the API without DEV_ROUTES=0.");
  process.exit(1);
}

const body = (i: number) => ({
  text: `A-8 note ${i}`,
  lat: config.demoCenter.lat,
  lng: config.demoCenter.lng,
  visibility: "public",
  anonymous: false,
  burnOnRead: false,
});

const rows: Record<string, string | number | boolean>[] = [];
for (const { mode, path } of MODES) {
  for (let run = 1; run <= RUNS; run++) {
    const user = await createUser(uniqueName(`a8${mode[0]}`));
    const started = performance.now();
    const results = await Promise.all(
      Array.from({ length: REQUESTS }, (_, i) => request("POST", path, { token: user.token, body: body(i) })),
    );
    const wallMs = performance.now() - started;

    const successes = results.filter((r) => r.status === 201).length;
    const limitRejected = results.filter((r) => r.status === 409).length;
    const otherErrors = REQUESTS - successes - limitRejected;
    const finalCount = (await getUser(user.username))?.activeNoteCount ?? NaN;
    const actualActiveNotes = await countActiveNotes(user.username);

    rows.push({
      mode,
      run,
      requests: REQUESTS,
      successes,
      limitRejected,
      otherErrors,
      finalCount,
      actualActiveNotes,
      overLimit: successes > N,
      countMismatch: finalCount !== actualActiveNotes,
      wallMs: Math.round(wallMs * 10) / 10,
    });
    console.log(
      `${mode.padEnd(11)} run ${String(run).padStart(2)}: successes=${successes} rejected=${limitRejected} other=${otherErrors} counter=${finalCount} realNotes=${actualActiveNotes}`,
    );
  }
}

writeCsv("a8-runs.csv", rows);

const summaryRows = MODES.map(({ mode }) => {
  const r = rows.filter((x) => x.mode === mode);
  const s = summarize(r.map((x) => Number(x.successes)));
  return {
    mode,
    runs: r.length,
    "min successes": s.min,
    "mean successes": s.mean,
    "max successes": s.max,
    "runs over limit": r.filter((x) => x.overLimit).length,
    "runs with counter ≠ real notes": r.filter((x) => x.countMismatch).length,
    "other errors": r.reduce((t, x) => t + Number(x.otherErrors), 0),
    "mean wall ms": summarize(r.map((x) => Number(x.wallMs))).mean,
  };
});

const cond = summaryRows[0];
const naive = summaryRows[1];
const condCorrect = cond["runs over limit"] === 0 && cond["min successes"] === N && cond["max successes"] === N && cond["runs with counter ≠ real notes"] === 0 && cond["other errors"] === 0;
const delayNote = config.naiveDelayMs > 0 ? ` (with NAIVE_DELAY_MS=${config.naiveDelayMs} on the API, simulating a ${config.naiveDelayMs} ms network gap)` : "";

writeSummary(
  "a8-summary.md",
  "A-8: N-note limit under concurrency, conditional transaction vs naive read-then-write",
  [
    "",
    `**Setup:** ${RUNS} runs per version. Each run, one fresh user sends ${REQUESTS} \`POST\` "write note" requests at the same moment. The limit is N = ${N} active notes. "counter" is the user's stored \`activeNoteCount\`; "real notes" is the number of active notes actually saved.`,
    "",
    mdTable(summaryRows),
    "",
    `**Conditional version:** ${condCorrect ? `exactly ${N} of ${REQUESTS} succeeded in every run, the other ${REQUESTS - N} got 409 NOTE_LIMIT_REACHED, and the counter always matched the real number of notes.` : "NOT always correct; see a8-runs.csv."}`,
    "",
    `**Naive version${delayNote}:** ${naive["runs over limit"]} / ${RUNS} runs went over the limit (up to ${naive["max successes"]} notes instead of ${N}), and ${naive["runs with counter ≠ real notes"]} / ${RUNS} runs ended with a counter that no longer matched the real number of notes (lost updates).`,
    "",
    "**Why:** the naive version reads the count, checks it, then writes count+1. Requests that arrive together all read the same old count, all pass the check, and overwrite each other's counter. The conditional version puts the check inside the write itself (`ADD activeNoteCount 1` only `IF activeNoteCount < N`) and combines it with the note write in one transaction, so the database rejects every write after the 5th.",
    "",
    "**Suggested chart:** grouped bar chart of `successes` per run for both versions, with a horizontal reference line at N = 5.",
  ].join("\n"),
);

process.exit(condCorrect ? 0 : 1);
