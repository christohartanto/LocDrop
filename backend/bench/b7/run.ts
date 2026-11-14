// OWNER: Wendy. B-7 benchmark: 20 readers open the same "delete after first read" note at the same moment.
// Expected every run: exactly 1 reader gets the text, 19 get 410 NOTE_GONE, author's slot released exactly once.
// Needs the API running: npm run dev:api:quiet

import { config } from "../../src/shared/config";
import { offsetMeters } from "../../src/shared/geo";
import { createNoteDirect, createUser, getNote, getUser, uniqueName } from "../lib/fixtures";
import { ensureServer, request } from "../lib/http";
import { mdTable, writeCsv, writeSummary } from "../lib/report";
import { summarize } from "../lib/stats";

const RUNS = Number(process.env.RUNS ?? 20);
const READERS = Number(process.env.READERS ?? 20);

await ensureServer();
const center = config.demoCenter;
const readers = await Promise.all(Array.from({ length: READERS }, () => createUser(uniqueName("b7r"))));

const rows: Record<string, string | number | boolean>[] = [];
for (let run = 1; run <= RUNS; run++) {
  const author = await createUser(uniqueName("b7a"));
  const note = await createNoteDirect(author.username, { ...center, burnOnRead: true, text: `B-7 run ${run}` });

  const started = performance.now();
  const results = await Promise.all(
    readers.map((r, i) => {
      // each reader stands within 5 m of the note
      const pos = offsetMeters(center.lat, center.lng, (i % 5) - 2, Math.floor(i / 5) - 2);
      return request("POST", `/notes/${note.id}/open`, { token: r.token, body: pos });
    }),
  );
  const wallMs = performance.now() - started;

  const textsReturned = results.filter((r) => r.status === 200 && typeof r.body?.text === "string").length;
  const gone410 = results.filter((r) => r.status === 410).length;
  const otherErrors = results.length - textsReturned - gone410;
  const finalCount = (await getUser(author.username))?.activeNoteCount ?? NaN;
  const finalStatus = (await getNote(note.id))?.status ?? "missing";

  rows.push({
    run,
    readers: READERS,
    textsReturned,
    gone410,
    otherErrors,
    slotReleases: 1 - finalCount,
    finalStatus,
    wallMs: Math.round(wallMs * 10) / 10,
  });
  console.log(`run ${run}: texts=${textsReturned} gone=${gone410} other=${otherErrors} releases=${1 - finalCount} status=${finalStatus}`);
}

writeCsv("b7-runs.csv", rows);

const correct = rows.filter((r) => r.textsReturned === 1 && r.slotReleases === 1 && r.otherErrors === 0).length;
const col = (k: string) => rows.map((r) => Number(r[k]));
const stat = (k: string) => {
  const s = summarize(col(k));
  return { metric: k, min: s.min, max: s.max, mean: s.mean };
};

writeSummary(
  "b7-summary.md",
  "B-7: first-reader rule under concurrency",
  [
    `**Setup:** ${RUNS} runs. Each run, ${READERS} different users (all within 5 m) call \`POST /notes/{id}/open\` on the same "delete after first read" note at the same moment.`,
    "",
    `**Result:** ${correct} / ${RUNS} runs were fully correct (exactly 1 text returned, exactly 1 slot release, no unexpected errors).`,
    "",
    mdTable([stat("textsReturned"), stat("gone410"), stat("otherErrors"), stat("slotReleases"), stat("wallMs")]),
    "",
    correct === RUNS
      ? `**Conclusion:** the conditional transaction (note status \`active → consumed\` + slot release) let exactly one reader win in every run; the other ${READERS - 1} were rejected with 410 and the author's slot was released exactly once.`
      : `**Conclusion:** ${RUNS - correct} run(s) were NOT correct; see b7-runs.csv.`,
    "",
    "**Suggested chart:** bar chart of `textsReturned` per run (expected: 1 every run), optionally stacked with `gone410`.",
  ].join("\n"),
);

process.exit(correct === RUNS ? 0 : 1);
