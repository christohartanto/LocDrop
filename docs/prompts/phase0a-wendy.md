# Phase 0a prompt (Wendy, Friday night)

Paste everything below the line into Claude Code, opened in the repo root.

---

You are generating the **shared backend foundation** for LocDrop, a 3-person university project (CSC4160 Cloud Computing). First read `README.md` (plan and folder ownership) and `api.md` (the API contract). Follow `api.md` exactly.

This covers checklist items **S-2 (types), S-4, S-5, S-6, S-8**. Teammates start building on this tomorrow morning, so it must work on the first try. Prefer boring, well-documented code over clever code.

## Hard rules

1. **Only create or edit** these paths:
   - root `package.json`, `.gitignore`, `docker-compose.yml`
   - `backend/` (everything inside it)
   - `docs/data-model.md`
   
   **Do NOT touch** `frontend/`, `README.md`, `api.md`, or `docs/prompts/`.
2. **Do not implement endpoint business logic.** Every endpoint handler is a placeholder that returns `501 NOT_IMPLEMENTED`. The only real logic outside `shared/`, `local/`, `scripts/` and `bench/lib/` is:
   - `backend/src/slots/index.ts`: a working reference implementation, described below
   - `backend/src/groups/membership.ts`: `isMember` always returns `false`
3. This is a **Windows + PowerShell** machine. Every npm script must work on Windows: use `cross-env` for environment variables, and no bash-only syntax.
4. **No npm workspaces.** `backend/` and `frontend/` are installed separately.
5. Handlers must keep the **real AWS Lambda signature** (API Gateway HTTP API v2 event in, structured result out), so the same code runs on Lambda later without changes.

## Stack

- Node.js 22+, TypeScript, run directly with `tsx` (no build step).
- `backend/package.json`: `"type": "module"`, `"private": true`.
- `backend/tsconfig.json`: `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `strict`, `noEmit`, `esModuleInterop`, `skipLibCheck`, `types: ["node"]`. Include `src`, `scripts`, `bench`, `tests`.
- Dependencies: `express@4`, `cors`, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `bcryptjs`, `jsonwebtoken`, `zod`, `ngeohash`.
- Dev dependencies: `typescript`, `tsx`, `vitest`, `cross-env`, `@types/node`, `@types/express@4`, `@types/cors`, `@types/aws-lambda`, `@types/jsonwebtoken`, `@types/ngeohash`. Add `@types/bcryptjs` only if the installed `bcryptjs` has no bundled types.

## Root files

**`package.json`** (private, no dependencies). Scripts:

```json
{
  "setup": "npm install --prefix backend && npm install --prefix frontend",
  "db:up": "docker compose up -d",
  "db:down": "docker compose down",
  "db:init": "npm run db:init --prefix backend",
  "db:reset": "npm run db:reset --prefix backend",
  "seed": "npm run seed --prefix backend",
  "token": "npm run token --prefix backend --",
  "smoke": "npm run smoke --prefix backend",
  "dev:api": "npm run dev --prefix backend",
  "dev:api:quiet": "npm run dev:quiet --prefix backend",
  "dev:web": "npm run dev --prefix frontend",
  "dev:web:mock": "npm run dev:mock --prefix frontend",
  "test": "npm test --prefix backend",
  "typecheck": "npm run typecheck --prefix backend",
  "bench:a8": "npm run bench:a8 --prefix backend",
  "bench:b7": "npm run bench:b7 --prefix backend",
  "bench:b8": "npm run bench:b8 --prefix backend",
  "bench:latency": "npm run bench:latency --prefix backend"
}
```

**`docker-compose.yml`**:

```yaml
services:
  dynamodb:
    image: amazon/dynamodb-local:latest
    command: "-jar DynamoDBLocal.jar -sharedDb -inMemory"
    ports:
      - "8000:8000"
```

**`.gitignore`**: `node_modules/`, `dist/`, `coverage/`, `.env*.local`. Do **not** ignore `backend/bench/results/`.

## `backend/package.json` scripts

```json
{
  "dev": "tsx watch src/local/server.ts",
  "dev:quiet": "cross-env LOG_REQUESTS=0 tsx src/local/server.ts",
  "db:init": "tsx scripts/create-table.ts",
  "db:reset": "tsx scripts/create-table.ts --reset",
  "seed": "tsx scripts/seed.ts",
  "token": "tsx scripts/token.ts",
  "smoke": "tsx scripts/smoke.ts",
  "test": "vitest run",
  "typecheck": "tsc --noEmit",
  "bench:a8": "tsx bench/a8/run.ts",
  "bench:b7": "tsx bench/b7/run.ts",
  "bench:b8": "cross-env TABLE_NAME=LocDropBench tsx bench/b8/run.ts",
  "bench:latency": "tsx bench/latency/run.ts"
}
```

## Table key design (must follow exactly)

One table, default name `LocDrop` (override with `TABLE_NAME`). All key attributes are strings.

| Item | PK | SK | Other attributes |
|---|---|---|---|
| User | `USER#<username>` | `PROFILE` | `username`, `passwordHash`, `activeNoteCount` (number), `createdAt` |
| Note | `NOTE#<id>` | `META` | `id`, `authorUsername`, `text`, `lat`, `lng`, `geohash` (precision 7), `visibility`, `groupId?`, `anonymous`, `burnOnRead`, `status` (`active` / `consumed` / `recalled`), `createdAt`, `consumedBy?`, `consumedAt?`, `recalledAt?`, `gsi1pk?`, `gsi1sk?`, `gsi2pk`, `gsi2sk` |

| Index | Partition key | Sort key | Notes |
|---|---|---|---|
| `GSI1` (geo) | `gsi1pk = CELL#<geohash7>` | `gsi1sk = <createdAt>#<id>` | **Sparse:** only active notes have these attributes. Consume and recall `REMOVE gsi1pk, gsi1sk` |
| `GSI2` (author) | `gsi2pk = AUTHOR#<username>` | `gsi2sk = <createdAt>` | For `GET /notes/mine` |

Both GSIs use projection `ALL`. Billing mode `PAY_PER_REQUEST`. Enable streams (`NEW_AND_OLD_IMAGES`), which are needed later for live pop-ups. Note ids come from `crypto.randomUUID()`.

Write this table and the access patterns (create user, get user, create note + reserve slot, nearby by cell, my notes, consume, recall) to `docs/data-model.md`.

## Files to create in `backend/src/shared/`

### `api-types.ts`
Copy the TypeScript block from `api.md` exactly.

### `config.ts`

```ts
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
export const config = {
  isLambda,
  tableName: process.env.TABLE_NAME ?? "LocDrop",
  dynamoEndpoint: process.env.DYNAMO_ENDPOINT ?? (isLambda ? undefined : "http://localhost:8000"),
  region: process.env.AWS_REGION ?? "us-east-1",
  maxActiveNotes: Number(process.env.MAX_ACTIVE_NOTES ?? 5),
  readRadiusM: Number(process.env.READ_RADIUS_M ?? 100),
  geohashPrecision: 7,
  noteMaxChars: 280,
  jwtSecret: process.env.JWT_SECRET ?? (isLambda ? "" : "dev-secret-change-me"),
  jwtTtl: "24h",
  bcryptCost: 10,
  naiveDelayMs: Number(process.env.NAIVE_DELAY_MS ?? 0),
  demoCenter: { lat: 22.69, lng: 114.21 },
};
```

On Lambda, throw at startup if `jwtSecret` is empty.

### `db.ts`
- `ddb`: a `DynamoDBDocumentClient` with `marshallOptions: { removeUndefinedValues: true }`. When `config.dynamoEndpoint` is set, also pass `endpoint`, the region, and dummy credentials `{ accessKeyId: "local", secretAccessKey: "local" }`.
- `export type TransactItem = NonNullable<TransactWriteCommandInput["TransactItems"]>[number];`
- `export class TransactionFailed extends Error { constructor(public reasons: string[]) }`: holds one cancellation reason code per item (`"None"`, `"ConditionalCheckFailed"`, …).
- `export async function transactWrite(items: TransactItem[], opts?: { maxAttempts?: number }): Promise<void>`:
  - Sends a `TransactWriteCommand`.
  - If a `TransactionCanceledException` has any `ConditionalCheckFailed` reason, throw `TransactionFailed(reasons)` straight away (a definite rule failure).
  - If the reasons include only `TransactionConflict` (or the error is `TransactionConflictException` / `TransactionInProgressException`), retry with random backoff of `random(5..25) * attempt` ms, up to `maxAttempts` (default 15).
  - When retries run out, throw the last error.
- `export function isConditionFailedAt(err: unknown, index: number): boolean` checks the reason for one item.
- `export function isConditionalCheckFailed(err: unknown): boolean` checks single-item writes (`ConditionalCheckFailedException`).
- `export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));`

### `keys.ts`
`userKey(username)`, `noteKey(id)`, `cellPk(geohash)`, `authorPk(username)`, constants `GSI1 = "GSI1"`, `GSI2 = "GSI2"`, and `noteIndexAttrs({ id, geohash, authorUsername, createdAt })`, which returns `{ gsi1pk, gsi1sk, gsi2pk, gsi2sk }`.

### `model.ts`
`UserItem` and `NoteItem` types matching the key design. Mapping functions:
- `toMyNote(n: NoteItem): MyNote`
- `toNoteSummary(n: NoteItem, distanceM: number): NoteSummary`: `authorName` is `null` if anonymous; `distanceM` is rounded to an integer.
- `toNoteDetail(n: NoteItem, distanceM: number, consumedByThisRead: boolean): NoteDetail`

### `geo.ts` (use `ngeohash`)
- `encode(lat, lng, precision = config.geohashPrecision): string`
- `cellsToSearch(lat, lng): string[]`: own cell + 8 neighbours, 9 unique cells
- `cellBounds(geohash): { minLat, minLng, maxLat, maxLng }` (from `decode_bbox`)
- `distanceM(lat1, lng1, lat2, lng2): number`: haversine with an Earth radius of 6,371,008.8 m
- `isValidLatLng(lat, lng): boolean`
- `offsetMeters(lat, lng, northM, eastM): { lat, lng }`: used by the seed and benchmarks

### `http.ts`
```ts
export type Event = APIGatewayProxyEventV2;
export type Result = APIGatewayProxyStructuredResultV2;
export type Handler = (event: Event) => Promise<Result>;
export class HttpError extends Error { constructor(public status: number, public code: ErrorCode, message: string) }
export function json(status: number, body: unknown): Result;          // sets content-type: application/json
export function noContent(): Result;                                   // 204
export function errorResult(status: number, code: ErrorCode, message: string): Result;
export function withErrors(fn: Handler): Handler;                      // HttpError → its JSON error; anything else → console.error + 500 INTERNAL
export function parseBody<T>(event: Event, schema: z.ZodType<T>): T;   // bad JSON or schema → HttpError 400 VALIDATION_ERROR
export function parseQuery<T>(event: Event, schema: z.ZodType<T>): T;  // uses queryStringParameters
export function notImplemented(id: string): never;                     // throws HttpError 501 NOT_IMPLEMENTED "<id> not implemented yet"
```

### `auth.ts`
```ts
export async function hashPassword(pw: string): Promise<string>;               // bcryptjs, config.bcryptCost
export async function verifyPassword(pw: string, hash: string): Promise<boolean>;
export function signToken(username: string): string;                           // HS256, config.jwtTtl, claim sub = username
export function verifyToken(token: string): { username: string } | null;
export type AuthedHandler = (event: Event, user: { username: string }) => Promise<Result>;
export function withAuth(fn: AuthedHandler): Handler;  // reads "authorization: Bearer x"; missing/invalid → 401 UNAUTHENTICATED; also applies withErrors
```

## Cross-slice interfaces (S-6)

**`backend/src/slots/index.ts`** starts with the header comment `// OWNER: Vincent. Frozen signatures; Wendy calls releaseSlot.` It is a working implementation:

```ts
export function reserveSlot(username: string): TransactItem;
// Update userKey(username): "ADD activeNoteCount :one"
// Condition: "attribute_exists(PK) AND activeNoteCount < :max"   (:max = config.maxActiveNotes)
export function releaseSlot(username: string): TransactItem;
// Update userKey(username): "ADD activeNoteCount :minusOne"
// Condition: "attribute_exists(PK) AND activeNoteCount > :zero"
```

**`backend/src/groups/membership.ts`** starts with `// OWNER: Vincent. Stub until A-4.`:

```ts
export async function isMember(username: string, groupId: string): Promise<boolean> { return false; }
```

## Placeholder handlers

Each file starts with a comment giving its OWNER, checklist ID and `api.md` section. Each exports `handler` and returns 501:
- Protected endpoints: `export const handler = withAuth(async () => notImplemented("A-6"));`
- Public endpoints: wrap with `withErrors` instead.

| Method + path (API Gateway style) | File | Auth | ID |
|---|---|---|---|
| `POST /auth/register` | `src/auth/register.ts` | public | A-1 |
| `POST /auth/login` | `src/auth/login.ts` | public | A-2 |
| `GET /me` | `src/auth/me.ts` | token | A-3 |
| `POST /groups` | `src/groups/create.ts` | token | A-4 |
| `POST /groups/join` | `src/groups/join.ts` | token | A-4 |
| `GET /groups` | `src/groups/list.ts` | token | A-4 |
| `POST /notes` | `src/notes-write/create.ts` | token | A-6 |
| `GET /notes/mine` | `src/notes-write/mine.ts` | token | A-7 |
| `GET /notes/nearby` | `src/notes-read/nearby.ts` | token | B-1 |
| `POST /notes/{id}/open` | `src/notes-read/open.ts` | token | B-4 |
| `DELETE /notes/{id}` | `src/notes-lifecycle/recall.ts` | token | B-6 |
| `POST /dev/naive/notes` (dev only) | `src/notes-write/create-naive.ts` | token | A-8 |

Also create an empty `src/realtime/.gitkeep`.

## Local server (S-8): `backend/src/local/`

**`routes.ts`** exports the table above as `{ method, path, devOnly?, load: () => import("../auth/register") }[]`, where `path` uses API Gateway style (`/notes/{id}/open`).

**`server.ts`**:
- Express 4 app, `cors()`, and `express.text({ type: "*/*", limit: "100kb" })` so the raw body stays a string.
- `GET /health` → `{ ok: true }`.
- For each route, convert `{id}` to `:id` for Express. On each request:
  1. Build an `APIGatewayProxyEventV2`: `version "2.0"`, `routeKey "POST /notes/{id}/open"`, `rawPath`, `rawQueryString`, lower-cased `headers`, `queryStringParameters` (strings only), `pathParameters`, `body` (string or undefined), `isBase64Encoded: false`, and `requestContext` with `http.method`, `http.path`, `requestId`, `routeKey`, `stage: "$default"`, `timeEpoch`.
  2. Call the handler, then send `statusCode`, `headers` and `body`.
- Mount dev-only routes unless `DEV_ROUTES=0`.
- Unknown routes → `404` with the `NOT_FOUND` error JSON.
- Log `METHOD path → status (ms)` unless `LOG_REQUESTS=0`.
- On startup:
  - Print `LocDrop local API on http://localhost:3000 (table <name> @ <endpoint>)`.
  - Run `DescribeTable`. If the table is missing, print a clear hint: `Table not found. Run: npm run db:up, npm run db:init, npm run seed`.
  - Use port `PORT` or 3000.

## Scripts (S-8): `backend/scripts/`

- **`lib/table.ts`**: `export async function createTable(name: string, opts: { reset?: boolean }): Promise<"created" | "exists">`. Builds the definition above, deletes the table first when `reset` is set, and waits until the table is active.
- **`create-table.ts`**: CLI for `config.tableName`, with the `--reset` flag. Prints `Created table X` or `Table X already exists`.
- **`seed.ts`**: writes the demo users and notes from `api.md` ("Demo data") using `offsetMeters` from `config.demoCenter`.
  - Uses fixed ids `seed-1` … `seed-5`, overwriting existing items, so it can safely run again.
  - Each user's `activeNoteCount` = their number of active seed notes.
  - Passwords hashed with `hashPassword("password123")`.
  - Prints a summary.
- **`token.ts`**: `npm run token -- alice` prints `signToken("alice")`.
- **`smoke.ts`**: calls the running server at `API_URL` (default `http://localhost:3000`) and prints `PASS` / `FAIL` per line; exits 1 on any FAIL. Checks:
  1. `GET /health` → 200
  2. Every token-protected route without a token → 401 with `error.code === "UNAUTHENTICATED"`
  3. Every route with alice's token and an empty or simple body → status < 500 **or** 501, with a JSON body
  4. `GET /does-not-exist` → 404 JSON

## Benchmark helpers (S-8): `backend/bench/lib/`

- **`http.ts`**:
  - `API_URL` (env, default `http://localhost:3000`)
  - `request(method, path, opts?: { token?: string; body?: unknown }): Promise<{ status: number; body: any; ms: number }>`, using built-in `fetch` and `performance.now()`
  - `ensureServer()`: exits with a clear message if `/health` fails
- **`fixtures.ts`** (writes straight to DynamoDB, bypassing endpoints, so benchmarks don't depend on other people's code):
  - `uniqueName(prefix)`: a lowercase username ≤ 20 characters
  - `createUser(username): Promise<{ username: string; token: string }>`: PROFILE item with `activeNoteCount: 0` and a bcrypt hash computed once at cost 4 and reused
  - `createNoteDirect(author, opts: { lat; lng; burnOnRead?; anonymous?; text? }): Promise<NoteItem>`: puts an active note **and** adds 1 to the author's count
  - `getUser(username)`
  - `getNote(id)`
  - `countActiveNotes(username)`: query GSI2 and count `status = active`
- **`stats.ts`**:
  - `percentile(values, p)` (nearest-rank)
  - `summarize(values)` → `{ n, min, max, mean, p50, p95 }` (rounded to 0.1)
  - `seededRandom(seed)` (mulberry32)
- **`report.ts`**:
  - `RESULTS_DIR = backend/bench/results` (created if missing)
  - `writeCsv(fileName, rows: Record<string, string | number | boolean>[])`
  - `mdTable(rows)`
  - `writeSummary(fileName, title, body)`: prepends date, Node version, CPU model, OS, table name and `MAX_ACTIVE_NOTES`
  - Each writer prints the full path of the file it wrote

Also create placeholder `bench/a8/run.ts`, `bench/latency/run.ts` (OWNER Vincent), and `bench/b7/run.ts`, `bench/b8/run.ts` (OWNER Wendy). Each only prints `<ID> not implemented yet (owner: <name>)`. Create `bench/results/.gitkeep`.

## Tests (Vitest): `backend/tests/shared/`

**`vitest.config.ts`**:
- `test.env = { TABLE_NAME: "LocDropTest" }`
- `globalSetup: "tests/global-setup.ts"`, which calls `createTable("LocDropTest", { reset: true })`
- `testTimeout: 30000`
- `fileParallelism: false`

Also create empty `tests/slice-a/.gitkeep` and `tests/slice-b/.gitkeep`.

**`geo.test.ts`**:
- `distanceM` of 0.001° latitude ≈ 111.2 m (±1 m).
- `cellsToSearch` returns 9 unique cells, including the caller's own cell.
- `encode` returns a 7-character geohash.
- **Edge test:** take the demo center's cell from `cellBounds`. A reader 1 m inside the east edge and a note 1 m outside it are in different cells, yet the note's cell is in the reader's `cellsToSearch`. Repeat for a corner (diagonal neighbour).

**`auth.test.ts`**:
- `signToken` / `verifyToken` round trip works.
- A tampered token → `null`.
- `withAuth` with no header → 401 `UNAUTHENTICATED`.
- With a valid token, the inner handler receives the username.

**`slots.test.ts`** (needs DynamoDB Local):
- With N = 5, **30 simultaneous** `transactWrite([reserveSlot(u)])` calls → **exactly 5** succeed. The rest reject with `TransactionFailed` whose reason is `ConditionalCheckFailed`. The final `activeNoteCount` is 5.
- `releaseSlot` on a user with count 0 rejects with `ConditionalCheckFailed`.

If the concurrency test fails because DynamoDB Local returns unexpected errors, print the error names and cancellation reasons and adjust the retry logic in `transactWrite`. **Do not weaken the test assertion.**

## Acceptance checks (run all of them; fix until every one passes)

```powershell
npm install --prefix backend
npm run typecheck                 # 0 errors
npm run db:up                     # docker ps shows the dynamodb container
npm run db:init                   # "Created table LocDrop"; run again: "already exists"
npm test                          # geo, auth, slots (incl. 30-way concurrency) all pass
npm run seed                      # prints 3 users and 5 notes
npm run dev:api                   # in a second terminal; prints the startup line
curl.exe http://localhost:3000/health   # {"ok":true}
npm run smoke                     # every line PASS
npm run token -- alice            # prints a JWT
```

When everything passes, summarise what was created and any deviations from this prompt. Then:

```powershell
git checkout -b feat/S-8-local-setup
git add -A
git commit -m "S-8: shared backend foundation, local server, DynamoDB Local, seed, bench helpers"
git push -u origin feat/S-8-local-setup
```

Open a PR titled `S-2/S-4/S-5/S-6/S-8: Phase 0a shared foundation` and ask Vincent and Eugene to review.
