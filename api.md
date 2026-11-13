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
→ `200 { notes: NoteSummary[] }`. Sorted by `distanceM` ascending. **No note text.**
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

### Groups (deferred: placeholders return `501 NOT_IMPLEMENTED`)
- `POST /groups` body `{ name }` → `201 { groupId, name, joinCode }`
- `POST /groups/join` body `{ joinCode }` → `200 { groupId, name }`
- `GET /groups` → `200 { groups: { groupId: string; name: string }[] }`

## Dev-only routes (local server only, never deployed)

| Route | Purpose |
|---|---|
| `GET /health` | `200 { "ok": true }` |
| `POST /dev/naive/notes` | Same as `POST /notes`, but uses a naive read-then-write slot check. Only for the A-8 benchmark |

## Live pop-ups (WebSocket, deferred until after the midterm)

See the README section "Live pop-ups".

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
