// MSW handlers: a fake LocDrop API in the browser that follows the api.md rules,
// including every error code, so all screens can be built without the backend.

import { delay, http, HttpResponse } from "msw";
import { API_URL } from "../api/client";
import type { CreateNoteRequest, ErrorCode, MyNote, NoteDetail, NoteSummary } from "../api/types";
import { distanceM } from "../lib/geo";
import {
  activeCount,
  MAX_ACTIVE_NOTES,
  type MockNote,
  notes,
  READ_RADIUS_M,
  tokenFor,
  usernameFromToken,
  users,
} from "./db";

const url = (path: string) => `${API_URL}${path}`;
const fail = (status: number, code: ErrorCode, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status });
const unauth = () => fail(401, "UNAUTHENTICATED", "Missing or invalid login token");

const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

function toMyNote(n: MockNote): MyNote {
  const { authorUsername: _a, consumedBy: _c, ...rest } = n;
  return rest;
}
function toSummary(n: MockNote, d: number): NoteSummary {
  return {
    id: n.id,
    distanceM: Math.round(d),
    authorName: n.anonymous ? null : n.authorUsername,
    visibility: n.visibility,
    burnOnRead: n.burnOnRead,
    createdAt: n.createdAt,
  };
}
const canSee = (n: MockNote, username: string) => n.visibility === "public" || n.authorUsername === username;

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const handlers = [
  http.post(url("/auth/register"), async ({ request }) => {
    await delay(250);
    const body = await readJson(request);
    const username = typeof body?.username === "string" ? body.username.toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return fail(400, "VALIDATION_ERROR", "username: 3–20 characters, lowercase letters, numbers or _");
    if (password.length < 8 || password.length > 72) return fail(400, "VALIDATION_ERROR", "password: must be 8–72 characters");
    if (users.has(username)) return fail(409, "USERNAME_TAKEN", "Username is taken");
    users.set(username, { username, password });
    return HttpResponse.json({ token: tokenFor(username), username }, { status: 201 });
  }),

  http.post(url("/auth/login"), async ({ request }) => {
    await delay(250);
    const body = await readJson(request);
    const username = typeof body?.username === "string" ? body.username.toLowerCase() : "";
    const user = users.get(username);
    if (!user || user.password !== body?.password) return fail(401, "INVALID_CREDENTIALS", "Wrong username or password");
    return HttpResponse.json({ token: tokenFor(username), username });
  }),

  http.get(url("/me"), ({ request }) => {
    const me = usernameFromToken(request.headers.get("authorization"));
    if (!me) return unauth();
    return HttpResponse.json({ username: me, activeNoteCount: activeCount(me), maxActiveNotes: MAX_ACTIVE_NOTES });
  }),

  http.post(url("/notes"), async ({ request }) => {
    await delay(300);
    const me = usernameFromToken(request.headers.get("authorization"));
    if (!me) return unauth();
    const body = (await readJson(request)) as Partial<CreateNoteRequest> | null;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 280) return fail(400, "VALIDATION_ERROR", "text: 1–280 characters");
    if (!isNum(body?.lat, -90, 90) || !isNum(body?.lng, -180, 180)) return fail(400, "VALIDATION_ERROR", "lat/lng: invalid");
    if (body?.visibility === "group") return fail(403, "NOT_GROUP_MEMBER", "Not a member of that group");
    if (activeCount(me) >= MAX_ACTIVE_NOTES) return fail(409, "NOTE_LIMIT_REACHED", "Already 5 active notes");
    const note: MockNote = {
      id: crypto.randomUUID(),
      authorUsername: me,
      text,
      lat: body.lat,
      lng: body.lng,
      visibility: "public",
      anonymous: !!body?.anonymous,
      burnOnRead: !!body?.burnOnRead,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    notes.set(note.id, note);
    return HttpResponse.json(toMyNote(note), { status: 201 });
  }),

  http.get(url("/notes/mine"), ({ request }) => {
    const me = usernameFromToken(request.headers.get("authorization"));
    if (!me) return unauth();
    const mine = [...notes.values()]
      .filter((n) => n.authorUsername === me)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toMyNote);
    return HttpResponse.json({ notes: mine });
  }),

  http.get(url("/notes/nearby"), async ({ request }) => {
    await delay(200);
    const me = usernameFromToken(request.headers.get("authorization"));
    if (!me) return unauth();
    const params = new URL(request.url).searchParams;
    const lat = Number(params.get("lat"));
    const lng = Number(params.get("lng"));
    if (!params.get("lat") || !params.get("lng") || !isNum(lat, -90, 90) || !isNum(lng, -180, 180)) {
      return fail(400, "VALIDATION_ERROR", "lat/lng: invalid");
    }
    const found = [...notes.values()]
      .filter((n) => n.status === "active" && canSee(n, me))
      .map((n) => ({ n, d: distanceM(lat, lng, n.lat, n.lng) }))
      .filter((x) => x.d <= READ_RADIUS_M)
      .sort((a, b) => a.d - b.d)
      .map((x) => toSummary(x.n, x.d));
    return HttpResponse.json({ notes: found });
  }),

  http.post(url("/notes/:id/open"), async ({ request, params }) => {
    await delay(250);
    const me = usernameFromToken(request.headers.get("authorization"));
    if (!me) return unauth();
    const body = await readJson(request);
    if (!isNum(body?.lat, -90, 90) || !isNum(body?.lng, -180, 180)) return fail(400, "VALIDATION_ERROR", "lat/lng: invalid");
    const note = notes.get(String(params.id));
    if (!note || !canSee(note, me)) return fail(404, "NOT_FOUND", "Note not found");
    if (note.status !== "active") return fail(410, "NOTE_GONE", "This note has already been read or recalled");
    const d = distanceM(body.lat, body.lng, note.lat, note.lng);
    if (d > READ_RADIUS_M) return fail(403, "OUT_OF_RANGE", `You are ${Math.round(d)} m away; move within ${READ_RADIUS_M} m`);
    let consumedByThisRead = false;
    if (note.burnOnRead && note.authorUsername !== me) {
      note.status = "consumed";
      note.consumedBy = me;
      note.consumedAt = new Date().toISOString();
      consumedByThisRead = true;
    }
    const detail: NoteDetail = { ...toSummary(note, d), text: note.text, consumedByThisRead };
    return HttpResponse.json(detail);
  }),

  http.delete(url("/notes/:id"), ({ request, params }) => {
    const me = usernameFromToken(request.headers.get("authorization"));
    if (!me) return unauth();
    const note = notes.get(String(params.id));
    if (!note || note.authorUsername !== me) return fail(404, "NOT_FOUND", "Note not found");
    if (note.status !== "active") return fail(410, "NOTE_GONE", "This note has already been read or recalled");
    note.status = "recalled";
    note.recalledAt = new Date().toISOString();
    return new HttpResponse(null, { status: 204 });
  }),

  http.all(url("/groups*"), () => fail(501, "NOT_IMPLEMENTED", "Groups are coming after the midterm")),
];
