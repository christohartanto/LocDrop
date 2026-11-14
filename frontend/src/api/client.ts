// Typed client for every endpoint in api.md. The server decides everything;
// this file only sends requests and turns error bodies into ApiError.

import { readStorage } from "../lib/storage";
import type {
  AuthRequest,
  AuthResponse,
  CreateNoteRequest,
  ErrorBody,
  ErrorCode,
  Me,
  MyNote,
  NoteDetail,
  NoteSummary,
} from "./types";

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000";
export const TOKEN_KEY = "locdrop_token";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode | "NETWORK_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Called on any 401, so the app can send the user back to login. */
let onUnauthenticated: (() => void) | null = null;
export function setUnauthenticatedHandler(fn: (() => void) | null) {
  onUnauthenticated = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = readStorage(TOKEN_KEY);
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the LocDrop server");
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }

  if (!res.ok) {
    const err = (data as ErrorBody | null)?.error;
    const apiError = new ApiError(res.status, err?.code ?? "INTERNAL", err?.message ?? `Request failed (${res.status})`);
    if (res.status === 401 && path !== "/auth/login") onUnauthenticated?.();
    throw apiError;
  }
  return data as T;
}

export const api = {
  register: (body: AuthRequest) => request<AuthResponse>("POST", "/auth/register", body),
  login: (body: AuthRequest) => request<AuthResponse>("POST", "/auth/login", body),
  getMe: () => request<Me>("GET", "/me"),
  createNote: (body: CreateNoteRequest) => request<MyNote>("POST", "/notes", body),
  getMyNotes: () => request<{ notes: MyNote[] }>("GET", "/notes/mine"),
  getNearby: (lat: number, lng: number) =>
    request<{ notes: NoteSummary[] }>("GET", `/notes/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`),
  openNote: (id: string, lat: number, lng: number) =>
    request<NoteDetail>("POST", `/notes/${encodeURIComponent(id)}/open`, { lat, lng }),
  recallNote: (id: string) => request<void>("DELETE", `/notes/${encodeURIComponent(id)}`),
};
