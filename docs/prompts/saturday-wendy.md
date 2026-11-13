# Wendy's Saturday kickoff prompt

Before you start: Phase 0a must be merged to `main`. Then run `git pull`, `npm run setup`, `npm run db:up`, `npm run db:init`, `npm run seed` and `npm test` (all should pass).

Paste everything below the line into Claude Code, opened in the repo root.

---

You are implementing **backend part B** of LocDrop for a midterm prototype due tonight. Everything runs locally: an Express server calls real Lambda-style handlers, which talk to DynamoDB Local in Docker. Read these first:
- `README.md` (section "Midterm prototype")
- `api.md` (the contract; follow it exactly, especially the check order for `POST /notes/{id}/open`)
- `docs/data-model.md`
- every file in `backend/src/shared/`
- `backend/src/slots/index.ts`
- `backend/src/groups/membership.ts`
- `backend/bench/lib/`

**Folders I may edit:**
- `backend/src/notes-read/`
- `backend/src/notes-lifecycle/`
- `backend/tests/slice-b/`
- `backend/bench/b7/`
- `backend/bench/b8/`
- my own result files in `backend/bench/results/` (`b7-*`, `b8-*`)

**Do NOT edit** `backend/src/shared/`, `backend/src/local/`, `backend/scripts/`, `backend/bench/lib/`, `backend/src/auth/`, `backend/src/notes-write/`, `backend/src/slots/`, `backend/src/groups/`, `frontend/`, `api.md`, `README.md`, `package.json`, or `docker-compose.yml`.
- I may **call** `releaseSlot` and `isMember`, but never change them.
- If something shared is broken, **stop and tell me** what and why, so I can fix it in a separate shared PR.

**Rules:**
- Keep the exported `handler` and its Lambda signature. Use `withAuth`, `parseBody` / `parseQuery`, `HttpError`, `json`, `noContent`, `transactWrite`, `isConditionFailedAt`, the `keys.ts` builders, the `model.ts` mappers and `geo.ts` from `shared/`. Don't write new versions of them.
- The server alone decides distance and permission.
- For today, group notes are visible only to their author (`isMember` returns `false`). Public and anonymous notes must work fully.

**Work in this order. After each item, run `npm run typecheck` and `npm test`, and show me the result:**

1. **B-1 + B-2:** `backend/src/notes-read/query.ts`:
   - `findNearbyByGeohash(lat, lng): Promise<{ items: { note: NoteItem; distanceM: number }[]; examined: number }>`:
     - `cellsToSearch(lat, lng)` → 9 cells.
     - Query `GSI1` (`gsi1pk = cellPk(cell)`) for all 9 **in parallel**, paginating fully.
     - `examined` = sum of `ScannedCount`.
     - Keep `status === "active"` and `distanceM(...) <= config.readRadiusM`; sort by distance.
   - `findNearbyByScan(lat, lng)`: same return shape, but `Scan` the whole table (paginating) and filter for notes (`SK === "META"`), active, within radius. **This is only for the B-8 benchmark.**
2. **B-3:** `backend/src/notes-read/visibility.ts`: `canSee(note, username): Promise<boolean>` = public **or** `note.authorUsername === username` **or** (group **and** `await isMember(username, note.groupId)`).
3. **B-1 handler:** `nearby.ts`, `GET /notes/nearby?lat&lng`: validate with `z.coerce.number()`; `findNearbyByGeohash`, then `canSee`, then `toNoteSummary`; return `{ notes }`.
4. **B-4 + B-5:** `open.ts` and `backend/src/notes-lifecycle/consume.ts`:
   - `open.ts` follows the `api.md` check order exactly: body → `GetCommand` with `ConsistentRead: true` → missing or `!canSee` → 404 → not active → 410 → distance > radius → 403 `OUT_OF_RANGE`.
   - If `burnOnRead` and the caller isn't the author, call `consumeNote(note, username)`:
     - `transactWrite([{ Update: noteKey: SET status = "consumed", consumedBy, consumedAt; REMOVE gsi1pk, gsi1sk; Condition status = "active" }, releaseSlot(note.authorUsername)])`.
     - `isConditionFailedAt(err, 0)` → 410 `NOTE_GONE`.
     - The winner gets `toNoteDetail(note, d, true)`.
   - Otherwise return `toNoteDetail(note, d, false)`.
5. **B-6:** `backend/src/notes-lifecycle/recall.ts`, `DELETE /notes/{id}`:
   - `GetCommand`; missing or not the author → 404.
   - `transactWrite([{ Update: SET status = "recalled", recalledAt; REMOVE gsi1pk, gsi1sk; Condition status = "active" AND authorUsername = :me }, releaseSlot(username)])`.
   - A condition failure → 410 `NOTE_GONE`. Success → 204.
6. **Tests** in `backend/tests/slice-b/`. Call handlers directly with a minimal fake `APIGatewayProxyEventV2`; set up data with `bench/lib/fixtures.ts`. Cover:
   - nearby: in range vs 150 m away; anonymous → `authorName: null`; consumed and recalled notes are not listed; another user's group note is hidden
   - open: 200, 403 `OUT_OF_RANGE`, 404, 410
   - burn: the first reader wins; the second gets 410; the author opening doesn't consume it; the slot is released once
   - recall: by the author → 204 and slot released; by someone else → 404; twice → 410
   - **Boundary (`boundary.test.ts`):** a note just across a geohash cell edge (1 m outside the east edge, and also across a corner) is found by `findNearbyByGeohash`; a note 99 m away is found, one 101 m away is not
7. **B-7 benchmark**, `backend/bench/b7/run.ts`:
   - Call `ensureServer()`. Create 20 reader users once with `createUser`.
   - For `run` 1..20:
     1. Create a fresh author and `createNoteDirect(author, { lat, lng at demo center, burnOnRead: true })`.
     2. All 20 readers call `POST /notes/{id}/open` **at the same moment** (`Promise.all`) from within 5 m.
     3. Count 200 responses that contain text, 410s and other statuses.
     4. Then read the author's `activeNoteCount` (`slotReleases = 1 - finalCount`) and the note's final status.
   - CSV `b7-runs.csv`: `run, readers, textsReturned, gone410, otherErrors, slotReleases, finalStatus, wallMs`.
   - Summary `b7-summary.md`: the number of runs where `textsReturned === 1 && slotReleases === 1`, min / max of each column, mean wall time, a one-line conclusion, and a suggested chart (bar chart of texts returned per run).
8. **B-8 benchmark**, `backend/bench/b8/run.ts` (runs with `TABLE_NAME=LocDropBench` through the npm script; calls `query.ts` directly, no HTTP):
   - `createTable("LocDropBench", { reset: true })`.
   - Seed notes **incrementally** to totals of 1,000 → 10,000 → 50,000:
     - Uniformly random within a 10 km × 10 km box around the demo center, using `seededRandom(42)`.
     - Write them with `BatchWriteCommand` (25 items per batch, 8 batches in parallel, retry `UnprocessedItems`).
     - Each must be a valid active `NoteItem` with index attributes. Build items directly; don't use `createNoteDirect` (too slow).
     - Print progress.
   - At each size, take 30 random query points (`seededRandom(7)`). At each point, run `findNearbyByGeohash` and `findNearbyByScan`, recording `latencyMs`, `examined` and `returned`. Assert both return **the same set of note ids** and count any mismatches.
   - CSV `b8-queries.csv`: `size, method, point, latencyMs, examined, returned, mismatch`.
   - Summary `b8-summary.md`:
     - A table: size | method | p50 ms | p95 ms | mean examined | mean returned | mismatches.
     - A note: "examined items is hardware-independent; absolute latency is DynamoDB Local on a laptop".
     - A suggested chart: latency and examined items vs table size, one line per method.
   - Print the elapsed time for each phase.
   - **If seeding 50k takes more than 5 minutes** on this machine, change the sizes to 1k / 5k / 20k and say so in the summary.

**Running benchmarks:**
- Terminal 1: `npm run dev:api:quiet` (needed for B-7 only)
- Terminal 2: `npm run bench:b7`, then `npm run bench:b8`

Final runs happen together at 20:00 on one machine.

**Git:** branch `feat/B-midterm`; commit per item with the ID first (`B-5: first-reader consume transaction`). Open a PR for Vincent to review.
