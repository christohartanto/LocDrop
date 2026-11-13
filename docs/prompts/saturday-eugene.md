# Eugene's prompts

Two prompts:
- **Prompt 1:** Friday night (S-7). Run it after `README.md` and `api.md` are on GitHub.
- **Prompt 2:** Saturday kickoff.

Paste each into Claude Code, opened in the repo root.

---

## Prompt 1: S-7, Friday night

You are building the frontend skeleton for LocDrop, a 3-person university project. Read `README.md` and `api.md` first. `api.md` is the API contract: follow it exactly.

**Folders I may edit:** only `frontend/`. Do NOT touch `backend/`, `api.md`, `README.md`, `docs/`, or the root `package.json` (a teammate is creating it tonight).

**Stack:** React + Vite + TypeScript (`npm create vite@latest frontend -- --template react-ts`), `react-router-dom`, `msw` (v2). Plain CSS in `src/styles.css`, no UI library. Mobile-first.

**Create:**
1. **`frontend/src/api/types.ts`:** the TypeScript block from `api.md`, copied exactly.
2. **`frontend/src/api/client.ts`:**
   - Typed functions for every endpoint in `api.md`: `register`, `login`, `getMe`, `createNote`, `getMyNotes`, `getNearby`, `openNote`, `recallNote`.
   - Base URL from `import.meta.env.VITE_API_URL`.
   - Adds `Authorization: Bearer <token>` from `localStorage("locdrop_token")`.
   - On a non-2xx response, throws `ApiError { status, code, message }`, parsed from `ErrorBody`.
3. **`frontend/src/mocks/`:** MSW handlers for every endpoint, with **in-memory state** that follows the `api.md` rules:
   - N = 5 limit → 409 `NOTE_LIMIT_REACHED`
   - 100 m radius using a haversine function → 403 `OUT_OF_RANGE`
   - Burn-on-read: first non-author open gets the text, later opens get 410 `NOTE_GONE`
   - Recall → 204, or 404 if not the author
   - Duplicate username → 409
   - Missing token → 401
   - Groups endpoints → 501
   
   Pre-load the demo users and notes from `api.md` ("Demo data"). Start MSW only when `VITE_USE_MOCKS === "true"` (`npx msw init public --save`).
4. **Env files and scripts:**
   - `frontend/.env.development`: `VITE_API_URL=http://localhost:3000`, `VITE_USE_MOCKS=false`
   - `frontend/.env.mock`: `VITE_API_URL=http://localhost:3000`, `VITE_USE_MOCKS=true`
   - `frontend/package.json` scripts: `"dev": "vite"`, `"dev:mock": "vite --mode mock"`, `"build"`, `"typecheck": "tsc --noEmit"`
5. **Placeholder pages and routes:** `/login`, `/register`, `/` (Nearby), `/new` (Write note), `/mine` (My notes). Add a bottom tab bar, and redirect to `/login` when there's no token.

**Acceptance checks:**
- `npm install --prefix frontend` succeeds.
- `npm run dev:mock --prefix frontend` starts on http://localhost:5173.
- With fake data: log in as `alice` / `password123`, then call `getNearby(22.69, 114.21)` from a temporary button and see the 4 in-range seed notes (`seed-5` is out of range).
- `npm run typecheck --prefix frontend` gives 0 errors.

**Then:**

```powershell
git checkout -b feat/S-7-frontend-skeleton
git add frontend
git commit -m "S-7: frontend skeleton, typed API client, MSW mocks"
git push -u origin feat/S-7-frontend-skeleton
```

Open a PR and ask Wendy to review.

---

## Prompt 2: Saturday kickoff

You are building the LocDrop frontend for a midterm prototype due tonight. Read `README.md` (section "Midterm prototype") and `api.md` first.

**Folders I may edit:** only `frontend/`. Do NOT edit `backend/`, `api.md`, `README.md`, `docs/`, the root `package.json` or `docker-compose.yml`. If the backend doesn't match `api.md`, **stop and tell me**. Do not work around it in the frontend.

**Rules:**
- The server is the only authority on distance and permission. The frontend never filters notes by distance itself and never hides server errors.
- Every screen handles loading, empty and error states. Map every `ErrorCode` from `api.md` to a friendly message in one place (`src/api/errors.ts`).
- Mobile-first: everything must work at 360 px width.
- Build and check everything in **mock mode first** (`npm run dev:web:mock`), then against the real local backend (`npm run dev:web`).

**Work through these in order, one at a time, and show me each before moving on:**

1. **FE-1:** Register and login screens. Username + password only; show `USERNAME_TAKEN`, `INVALID_CREDENTIALS` and `VALIDATION_ERROR` nicely. Save the token; add a logout button; any 401 → back to login.
2. **FE-2:** `src/hooks/useGeolocation.ts`: uses `navigator.geolocation.watchPosition` and returns `{ lat, lng, accuracyM, status: "loading" | "ok" | "denied" | "unavailable" }`. If a dev override is set (FE-11), return that instead. Show a clear message when permission is denied.
3. **FE-11:** `src/dev/LocationOverride.tsx`, rendered only when `import.meta.env.DEV`. A small floating "📍 Dev" button opens a panel with presets:
   - Real GPS
   - Demo center (22.69, 114.21)
   - 50 m east
   - 90 m east
   - 150 m east (out of range)
   - 300 m west
   - Custom lat/lng inputs
   
   Saved in `localStorage` (wrapped in try/catch). Tip: open a second browser profile or private window to be a second user (e.g. `bob`) at a different location.
4. **FE-3:** Nearby screen (`/`). Calls `getNearby` with the current location on load, every 15 s, when the location moves more than 20 m, and on a Refresh button. Shows distance, author (or "Anonymous") and a "🔥 disappears after first read" badge. Has an empty state.
5. **FE-4:** Tap a note to open it: call `openNote(id, current location)` and show only the returned text. If `consumedByThisRead`, say "You were the first reader, so this note is now gone." Handle `OUT_OF_RANGE` ("Move closer"), `NOTE_GONE` (remove it from the list) and `NOT_FOUND`.
6. **FE-5:** Write note screen (`/new`).
   - Textarea with a live "x / 280" counter.
   - Public/group choice: group is disabled and labelled "Groups coming soon".
   - Anonymous toggle and "Delete after first read" toggle.
   - Posts the current location; on success, go to My notes.
7. **FE-6:** Header shows "x / N notes used" from `getMe`, refreshed after creating or recalling. The write button is disabled when full. Handle `NOTE_LIMIT_REACHED`.
8. **FE-7:** My notes screen (`/mine`). List from `getMyNotes` with a status badge (active / consumed / recalled). The Recall button on active notes calls `recallNote`, then refreshes the list and slot count; handle `NOTE_GONE`.

**At ~16:00, switch to the real backend:**
1. Make sure `npm run dev:api` is running (or point `VITE_API_URL` at Wendy's laptop IP).
2. Run `npm run dev:web`.
3. Repeat the flow: login as alice → nearby → open `seed-4` as carol (burn) → write a note → recall.
4. List any mismatches with `api.md` and tell me; don't patch around them.

**Acceptance (before the 20:00 merge):**
- `npm run typecheck --prefix frontend` gives 0 errors.
- The full flow works in mock mode **and** against the real local backend.
- Screenshots of each screen at phone width are saved to `docs/screenshots/` for the report. This is the one exception to "frontend only"; only add image files there.

Commit per item with the ID first, e.g. `FE-3: nearby screen`. Use branch `feat/FE-midterm`, and open a PR for Wendy or Vincent to review.
