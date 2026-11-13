# Vincent's Saturday kickoff prompt

Before you start: Phase 0a must be merged to `main`. Then run `git pull`, `npm run setup`, `npm run db:up`, `npm run db:init`, `npm run seed` and `npm test` (all should pass).

Paste everything below the line into Claude Code, opened in the repo root.

---

You are implementing **backend part A** of LocDrop for a midterm prototype due tonight. Everything runs locally: an Express server calls real Lambda-style handlers, which talk to DynamoDB Local in Docker. Read these first:
- `README.md` (section "Midterm prototype")
- `api.md` (the contract; follow it exactly)
- `docs/data-model.md`
- every file in `backend/src/shared/`
- `backend/src/slots/index.ts`
- `backend/bench/lib/`

**Folders I may edit:**
- `backend/src/auth/`
- `backend/src/notes-write/`
- `backend/src/slots/` (implementation only; the `reserveSlot` / `releaseSlot` signatures are frozen because Wendy uses them)
- `backend/src/groups/` (leave `isMember` returning `false` today)
- `backend/tests/slice-a/`
- `backend/bench/a8/`
- `backend/bench/latency/`
- my own result files in `backend/bench/results/` (`a8-*`, `latency-*`)

**Do NOT edit** `backend/src/shared/`, `backend/src/local/`, `backend/scripts/`, `backend/bench/lib/`, `backend/src/notes-read/`, `backend/src/notes-lifecycle/`, `frontend/`, `api.md`, `README.md`, `package.json`, or `docker-compose.yml`. If something there is broken or missing, **stop and tell me** what and why. Don't work around it.

**Rules:**
- Keep the exported `handler` and its Lambda signature. Use `withAuth` / `withErrors`, `parseBody`, `HttpError`, `json`, `transactWrite`, the `keys.ts` builders and the `model.ts` mappers from `shared/`. Don't write new versions of them.
- Validate input with zod using the rules in `api.md`.
- Never write `activeNoteCount` except through `slots/index.ts` (the naive benchmark version is the one documented exception).

**Work in this order. After each item, run `npm run typecheck` and `npm test`, and show me the result:**

1. **A-1** `POST /auth/register`:
   - Lower-case the username, then validate it.
   - `hashPassword`, then `PutCommand` with `ConditionExpression: "attribute_not_exists(PK)"`. Initialise `activeNoteCount: 0` and `createdAt`.
   - A conditional failure → 409 `USERNAME_TAKEN`.
   - Return 201 `{ token, username }`.
2. **A-2** `POST /auth/login`: `GetCommand`, then `verifyPassword`. An unknown user **or** wrong password → 401 `INVALID_CREDENTIALS`. Return 200 `{ token, username }`.
3. **A-3** `GET /me` → `{ username, activeNoteCount, maxActiveNotes: config.maxActiveNotes }`.
4. **A-6** `POST /notes`:
   - Validate. If `visibility === "group"`, call `isMember`; `false` → 403 `NOT_GROUP_MEMBER`.
   - Build the `NoteItem`: `id = crypto.randomUUID()`, `geohash = encode(lat, lng)`, `status: "active"`, `createdAt`, plus `noteIndexAttrs(...)`.
   - `transactWrite([reserveSlot(username), { Put: { TableName, Item: note, ConditionExpression: "attribute_not_exists(PK)" } }])`.
   - `isConditionFailedAt(err, 0)` → 409 `NOTE_LIMIT_REACHED`.
   - Return 201 `toMyNote(note)`.
5. **A-7** `GET /notes/mine`: query `GSI2` with `gsi2pk = authorPk(username)`, `ScanIndexForward: false`, paginate fully, and map with `toMyNote`.
6. **A-5** Tests in `backend/tests/slice-a/`:
   - register: success, duplicate, bad input
   - login: success, wrong password, unknown user
   - me
   - create: success, 6th note → 409, group → 403
   - mine: order and status
   
   Call handlers directly with a minimal fake `APIGatewayProxyEventV2`, and use `bench/lib/fixtures.ts` for users. Tests run against the `LocDropTest` table.
7. **A-8 naive version**, `backend/src/notes-write/create-naive.ts` (dev-only route `POST /dev/naive/notes`):
   - Same validation as create.
   - `GetCommand` the user with `ConsistentRead: true`. If `activeNoteCount >= max` → 409 `NOTE_LIMIT_REACHED`.
   - `await sleep(config.naiveDelayMs)`.
   - `PutCommand` the note.
   - `UpdateCommand` with `SET activeNoteCount = :readValuePlusOne`. This is a deliberate lost update with **no condition**.
   - Return 201.
   - Add a header comment: `// BENCHMARK ONLY: intentionally unsafe read-then-write. Never deployed.`
8. **A-8 benchmark**, `backend/bench/a8/run.ts`:
   - Call `ensureServer()`.
   - For `mode` in `["conditional", "naive"]` (routes `/notes` and `/dev/naive/notes`), for `run` 1..20:
     1. `createUser(uniqueName("a8"))`.
     2. Fire **50** `POST` requests at the same moment (`Promise.all`), with valid bodies at the demo center.
     3. Count `201`, `409` and other statuses.
     4. Read the final `activeNoteCount` via `getUser` and the real number of active notes via `countActiveNotes`.
   - CSV `a8-runs.csv` columns: `mode, run, requests, successes, limitRejected, otherErrors, finalCount, actualActiveNotes, overLimit (successes > N), countMismatch (finalCount !== actualActiveNotes), wallMs`.
   - Summary `a8-summary.md`:
     - Per mode: min / mean / max successes, the number of runs over the limit, the number of runs with a count mismatch, and mean wall time.
     - A one-line conclusion.
     - A suggested chart: grouped bar of successes per run with a reference line at N = 5.
   - If naive mode never goes over the limit, rerun with `NAIVE_DELAY_MS=5` (an env var on the **API server**: `$env:NAIVE_DELAY_MS="5"; npm run dev:api:quiet`) and record this in the summary as "simulated 5 ms network gap". Never fake results.
9. **L-1 latency**, `backend/bench/latency/run.ts`:
   - Call `ensureServer()`. Sequential requests, 10 warm-up requests not counted. Endpoints and sample counts:
     - `POST /auth/register` ×30 (fresh usernames)
     - `POST /auth/login` ×30
     - `GET /me` ×200
     - `POST /notes` ×200 (rotate across 40 fixture users, 5 notes each, to stay under N)
     - `GET /notes/mine` ×200
     - `GET /notes/nearby` ×200 (at the demo center after `npm run seed`)
     - `POST /notes/{id}/open` ×200 (a non-burn note at the demo center)
     - `DELETE /notes/{id}` ×200 (notes made with `createNoteDirect` first)
   - If an endpoint returns 501, record it as "not implemented" and continue.
   - Raw CSV `latency-samples.csv` (`endpoint, i, status, ms`).
   - Summary `latency-summary.md` with a table: endpoint | n | p50 ms | p95 | mean | max | errors. Add a note that register and login include bcrypt hashing (cost 10) and that numbers are from a local machine.

**Running benchmarks:**
- Terminal 1: `npm run dev:api:quiet`
- Terminal 2: `npm run bench:a8`, then `npm run bench:latency`

Both must finish in under 5 minutes. Final runs happen together at 20:00 on one machine.

**Git:** branch `feat/A-midterm`; commit per item with the ID first (`A-6: create note with slot reservation`). Open a PR for Wendy to review.
