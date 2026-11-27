# LocDrop data model (DynamoDB, single table)

SHARED, frozen after Phase 0a. Code: `backend/src/shared/keys.ts`, `backend/src/shared/model.ts`, `backend/scripts/lib/table.ts`.

- **Table:** `LocDrop` (override with `TABLE_NAME`; tests use `LocDropTest`, B-8 uses `LocDropBench`).
- **Billing:** on-demand.
- **Streams:** `NEW_AND_OLD_IMAGES` (for live pop-ups later).
- **Keys:** all key attributes are strings.

## Items

| Item | PK | SK | Other attributes |
|---|---|---|---|
| User | `USER#<username>` | `PROFILE` | `username`, `passwordHash`, `activeNoteCount` (number), `createdAt` |
| Group membership | `USER#<username>` | `GROUP#<groupId>` | `username`, `groupId`, `name`, `joinCode`, `joinedAt` |
| Group | `GROUP#<groupId>` | `META` | `groupId`, `name`, `joinCode`, `createdBy`, `createdAt` |
| Join code | `JOINCODE#<code>` | `META` | `joinCode`, `groupId`, `name` |
| Note | `NOTE#<id>` | `META` | `id`, `authorUsername`, `text`, `lat`, `lng`, `geohash` (precision 7), `visibility`, `groupId?`, `anonymous`, `burnOnRead`, `status` (`active` / `consumed` / `recalled`), `createdAt`, `consumedBy?`, `consumedAt?`, `recalledAt?`, `gsi1pk?`, `gsi1sk?`, `gsi2pk`, `gsi2sk` |

## Indexes (both projection `ALL`)

| Index | Partition key | Sort key | Notes |
|---|---|---|---|
| `GSI1` (geo) | `gsi1pk = CELL#<geohash7>` | `gsi1sk = <createdAt>#<id>` | **Sparse:** only active notes. Consume and recall `REMOVE gsi1pk, gsi1sk` |
| `GSI2` (author) | `gsi2pk = AUTHOR#<username>` | `gsi2sk = <createdAt>` | All of an author's notes, any status |

## Who writes what

| Attribute | Written by |
|---|---|
| User item | Vincent (register) |
| `activeNoteCount` | **Only** `slots/index.ts` (`reserveSlot` / `releaseSlot`) |
| Group, join code and membership items | Vincent (`groups/`) |
| Note item at creation | Vincent (`POST /notes`) |
| `status`, `consumed*`, `recalledAt`, removing `gsi1*` | **Only** Wendy (`notes-lifecycle/`) |

## Access patterns

| Pattern | Operation |
|---|---|
| Create user | `Put USER#u/PROFILE`, condition `attribute_not_exists(PK)` |
| Get user (login, /me) | `Get USER#u/PROFILE` |
| Create note + reserve slot | `TransactWrite [ Update USER#u (ADD activeNoteCount 1, cond activeNoteCount < N), Put NOTE#id (cond attribute_not_exists(PK)) ]` |
| Nearby notes | `Query GSI1` for each of the 9 cells (own + 8 neighbours), then exact haversine distance ≤ 100 m |
| My notes | `Query GSI2 gsi2pk = AUTHOR#u`, newest first |
| Create group | `TransactWrite [ Put GROUP#id (cond attribute_not_exists), Put JOINCODE#code (cond attribute_not_exists; on failure pick a new code), Put USER#creator/GROUP#id ]` |
| Join group | `Get JOINCODE#code`, then `Put USER#u/GROUP#id` (cond attribute_not_exists, so re-joining keeps `joinedAt`) |
| My groups | `Query PK = USER#u AND begins_with(SK, "GROUP#")` |
| `isMember(u, g)` | `Get USER#u/GROUP#g` |
| Open note | `Get NOTE#id` (consistent read) |
| Consume (first reader) | `TransactWrite [ Update NOTE#id (SET status=consumed…, REMOVE gsi1pk, gsi1sk; cond status = active), Update USER#author (ADD -1, cond > 0) ]` |
| Recall | `TransactWrite [ Update NOTE#id (SET status=recalled…, REMOVE gsi1*; cond status = active AND authorUsername = caller), Update USER#author (ADD -1, cond > 0) ]` |

Transactions go through `transactWrite()` in `shared/db.ts`, which retries when DynamoDB cancels because of a `TransactionConflict` (two transactions touching the same item at once).

## Why geohash precision 7

- A precision-7 cell is about 153 m × 153 m (about 141 m wide at Shenzhen's latitude).
- With a 100 m radius, every note within range lies in the caller's own cell or one of its 8 neighbours.
- If the radius ever exceeds about 140 m, switch to precision 6.
