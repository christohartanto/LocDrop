# LocDrop API contract (v1)

This file is the contract between frontend and backend. **Changes need approval from all three.**

- Local base URL: `http://localhost:3000`
- All bodies are JSON. All endpoints except register and login need `Authorization: Bearer <token>`.
- Coordinates: `lat` in [-90, 90], `lng` in [-180, 180], decimal degrees.

## Types

Copy this block **exactly** into `frontend/src/api/types.ts` and `backend/src/shared/api-types.ts`.

```ts
export type Visibility = "public" | "group";
export type NoteStatus = "active" | "consumed" | "recalled";

export interface AuthRequest { username: string; password: string }
export interface AuthResponse { token: string; username: string }

export interface Me { username: string; activeNoteCount: number; maxActiveNotes: number }

export interface CreateNoteRequest {
  text: string;
  lat: number;
  lng: number;
  visibility: Visibility;
  groupId?: string;          // required when visibility = "group"
  anonymous: boolean;
  burnOnRead: boolean;       // "delete after first read"
}

export interface MyNote {
  id: string;
  text: string;
  lat: number;
  lng: number;
  visibility: Visibility;
  groupId?: string;
  anonymous: boolean;
  burnOnRead: boolean;
  status: NoteStatus;
  createdAt: string;         // ISO 8601
  consumedAt?: string;
  recalledAt?: string;
}

export interface NoteSummary {
  id: string;
  distanceM: number;         // integer metres from the caller
  lat: number;               // where the note is (only notes in range are ever returned)
  lng: number;
  authorName: string | null; // null = anonymous
  visibility: Visibility;
  groupName?: string;        // unused until groups are built
  burnOnRead: boolean;
  createdAt: string;
}

export interface NoteDetail extends NoteSummary {
  text: string;
  consumedByThisRead: boolean; // true = this read triggered "delete after first read"
}

export interface CreateGroupRequest { name: string }
export interface JoinGroupRequest { joinCode: string }
export interface Group { groupId: string; name: string; joinCode: string } // any member may share the code
export type CreateGroupResponse = Group;
export interface GroupList { groups: Group[] }  // sorted by name

export type ErrorCode =
  | "VALIDATION_ERROR"     // 400
  | "UNAUTHENTICATED"      // 401
  | "INVALID_CREDENTIALS"  // 401
  | "NOT_GROUP_MEMBER"     // 403
  | "OUT_OF_RANGE"         // 403
  | "NOT_FOUND"            // 404
  | "USERNAME_TAKEN"       // 409
  | "NOTE_LIMIT_REACHED"   // 409
  | "NOTE_GONE"            // 410
  | "INTERNAL"             // 500
  | "NOT_IMPLEMENTED";     // 501 (placeholder endpoints only)

export interface ErrorBody { error: { code: ErrorCode; message: string } }
```

## Validation rules

| Field | Rule |
|---|---|
| `username` | Lower-cased by the server, then must match `^[a-z0-9_]{3,20}$` |
| `password` | 8–72 characters |
| `text` | 1–280 characters after trimming |
| `lat`, `lng` | Numbers in range (query strings are converted to numbers) |
| `groupId` | Required if and only if `visibility = "group"` |
| `name` (group) | 1–40 characters after trimming |
| `joinCode` | Upper-cased, spaces and dashes removed, then must be 6 letters or numbers |

Anything invalid → `400 VALIDATION_ERROR`.

## Endpoints

### `POST /auth/register` (public)
Body `AuthRequest` → `201 AuthResponse`.
Errors: `400 VALIDATION_ERROR`, `409 USERNAME_TAKEN`.

### `POST /auth/login` (public)
Body `AuthRequest` → `200 AuthResponse`.
Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS` (same error for unknown user and wrong password).

### `GET /me`
→ `200 Me`.

### `POST /notes`
Body `CreateNoteRequest` → `201 MyNote` (status `active`).
Errors: `400 VALIDATION_ERROR`, `403 NOT_GROUP_MEMBER`, `409 NOTE_LIMIT_REACHED` (already N active notes).

### `GET /notes/mine`
→ `200 { notes: MyNote[] }`. All statuses, newest first.

### `GET /notes/nearby?lat=..&lng=..`
→ `200 { notes: NoteSummary[] }`. Sorted by `distanceM` ascending. **No note text.** Each note includes its `lat`/`lng` so the app can show it on the map; since only notes within the read radius are returned, this reveals nothing about notes the caller could not open anyway.
Includes only notes that are:
- `active`,
- within the read radius (100 m), measured by the server, and
- visible to the caller: public, **or** written by the caller, **or** a group note where the caller is a member.

`authorName` is `null` when the note is anonymous.
Errors: `400 VALIDATION_ERROR`.

### `POST /notes/{id}/open`
Body `{ lat: number, lng: number }` → `200 NoteDetail`.
The server checks, in this order:
1. Body is valid; otherwise `400 VALIDATION_ERROR`.
2. Note exists and the caller may see it (same visibility rule as nearby); otherwise `404 NOT_FOUND`.
3. Note is `active`; otherwise `410 NOTE_GONE`.
4. Caller is within the read radius; otherwise `403 OUT_OF_RANGE`.
5. If `burnOnRead` and the caller is **not** the author: exactly one caller wins. The winner gets `200` with `consumedByThisRead: true`, and everyone else gets `410 NOTE_GONE`. The author's slot is released.
6. Otherwise `200` with `consumedByThisRead: false`.

### `DELETE /notes/{id}` (recall)
→ `204` (no body).
Errors: `404 NOT_FOUND` (note doesn't exist **or** the caller isn't the author), `410 NOTE_GONE` (already consumed or recalled).
On success, the author's slot is released.

### `POST /groups`
Body `CreateGroupRequest` → `201 Group`.
The creator is a member straight away. The join code is 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ2345679` (no look-alikes such as 0/O or 1/I) and is unique.
Errors: `400 VALIDATION_ERROR`.

### `POST /groups/join`
Body `JoinGroupRequest` → `200 Group`.
Codes are case-insensitive (`abc-234` works for `ABC234`). Joining a group you're already in also returns `200`.
Errors: `400 VALIDATION_ERROR`, `404 NOT_FOUND` (no group has that code).

### `GET /groups`
→ `200 GroupList`: the groups I created or joined, sorted by name. Empty list if none.

Group notes: only members can write them (`403 NOT_GROUP_MEMBER` otherwise) and only members (plus the author) see and open them. There's no "leave group" in v1.

## Dev-only routes (local server only, never deployed)

| Route | Purpose |
|---|---|
| `GET /health` | `200 { "ok": true }` |
| `POST /dev/naive/notes` | Same as `POST /notes`, but uses a naive read-then-write slot check. Only for the A-8 benchmark |

## Live pop-ups (WebSocket)

- URL: `wss://<ws-api>/<stage>?token=<login token>` on AWS (the deploy prints it as **Live**; the web app gets it as `VITE_WS_URL`); `ws://localhost:3000/?token=<login token>` locally.
- A missing or invalid token is refused during the handshake (HTTP 401). Connections last at most 2 hours on AWS (and close after 10 minutes with no messages), so the app reconnects when a connection drops.

| Direction | Message | Meaning |
|---|---|---|
| Phone → server | `{ "action": "location", "lat": number, "lng": number }` | "I'm here." Send right after connecting and whenever you move ~20 m. No pop-ups arrive until the first one |
| Server → phone | `{ "type": "note_nearby", "note": NoteSummary }` | A note was just dropped within the read radius of my last location, and I may see it (same rules as `GET /notes/nearby`). Never sent for my own notes. `distanceM` is from my last reported location |
| Server → phone | `{ "type": "note_gone", "id": string }` | A note near me that I may see was read (first-reader rule) or recalled. Remove it if it's in my list. Sent to the author too |

- Messages never contain the note text: reading still goes through `POST /notes/{id}/open`.
- Pop-ups are best effort. After a reconnect, call `GET /notes/nearby` to catch up on anything missed.
- Invalid messages, or other `action` values, are ignored. No reply is sent.

## Demo data (shared by seed script and frontend dev location panel)

- **Demo center:** `lat 22.6900, lng 114.2100` (roughly CUHK-Shenzhen; the exact value doesn't matter)
- **Users** (password `password123` for all): `alice`, `bob`, `carol`

| Seed note | Author | Position from center | Options |
|---|---|---|---|
| `seed-1` "Welcome to LocDrop!" | alice | at center | public |
| `seed-2` "Library is quiet today" | bob | 30 m north | public |
| `seed-3` "Guess who wrote this" | alice | 60 m east | public, anonymous |
| `seed-4` "First reader takes it!" | bob | 20 m south | public, delete after first read |
| `seed-5` "You found me from far away" | alice | 300 m west | public (out of range from center) |
