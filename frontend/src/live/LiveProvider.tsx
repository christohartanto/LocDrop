// FE-10: live pop-ups. One WebSocket per logged-in app (api.md "Live pop-ups"):
//  - connects with the login token, then sends my location right away and whenever I move ~20 m
//  - passes note_nearby / note_gone to whoever subscribed (the map, the pop-up banner)
//  - reconnects with growing delays if the connection drops, and straight away when the tab comes back
// Pop-ups are best effort: the map still refreshes from GET /notes/nearby, just less often while live.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { API_URL, TOKEN_KEY } from "../api/client";
import type { NoteSummary } from "../api/types";
import { useSession } from "../auth/session";
import { useGeolocation } from "../hooks/useGeolocation";
import { distanceM } from "../lib/geo";
import { readStorage } from "../lib/storage";

export type LiveMessage = { type: "note_nearby"; note: NoteSummary } | { type: "note_gone"; id: string };
export type LiveStatus = "off" | "connecting" | "live";

const MOVE_M = 20;
const MAX_BACKOFF_MS = 30_000;

/** VITE_WS_URL on AWS; otherwise the API's own address (local server, or /api through Vite in phone mode). */
export function liveUrl(): string | null {
  if (import.meta.env.VITE_USE_MOCKS === "true") return null; // the fake API has no WebSocket
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicit) return explicit;
  if (/^https?:\/\//.test(API_URL)) return API_URL.replace(/^http/, "ws");
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${API_URL}`; // relative API_URL, e.g. "/api"
}

interface Live {
  status: LiveStatus;
  subscribe: (fn: (m: LiveMessage) => void) => () => void;
}

const LiveContext = createContext<Live>({ status: "off", subscribe: () => () => {} });

export function LiveProvider({ children }: { children: ReactNode }) {
  const { username } = useSession();
  const geo = useGeolocation();
  const [status, setStatus] = useState<LiveStatus>("off");
  const [attempt, setAttempt] = useState(0); // bump to reconnect
  const listeners = useRef(new Set<(m: LiveMessage) => void>());
  const socket = useRef<WebSocket | null>(null);
  const lastSent = useRef<{ lat: number; lng: number } | null>(null);
  const here = useRef<{ lat: number; lng: number } | null>(null);
  const failures = useRef(0);

  here.current = geo.status === "ok" && geo.lat !== null && geo.lng !== null ? { lat: geo.lat, lng: geo.lng } : null;
  const haveLocation = here.current !== null;
  const url = liveUrl();

  const sendLocation = useCallback((force: boolean) => {
    const ws = socket.current;
    const pos = here.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !pos) return;
    const prev = lastSent.current;
    if (!force && prev && distanceM(prev.lat, prev.lng, pos.lat, pos.lng) < MOVE_M) return;
    ws.send(JSON.stringify({ action: "location", lat: pos.lat, lng: pos.lng }));
    lastSent.current = pos;
  }, []);

  // open / reopen the connection
  useEffect(() => {
    const token = readStorage(TOKEN_KEY);
    if (!username || !token || !url || !haveLocation) {
      setStatus("off");
      return;
    }
    let closedOnPurpose = false;
    let retryTimer: number | undefined;
    setStatus("connecting");
    const ws = new WebSocket(`${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`);
    socket.current = ws;

    ws.onopen = () => {
      failures.current = 0;
      lastSent.current = null;
      setStatus("live");
      sendLocation(true);
    };
    ws.onmessage = (e) => {
      let msg: LiveMessage;
      try {
        msg = JSON.parse(String(e.data)) as LiveMessage;
      } catch {
        return;
      }
      if (msg?.type !== "note_nearby" && msg?.type !== "note_gone") return;
      for (const fn of listeners.current) fn(msg);
    };
    ws.onclose = () => {
      if (socket.current === ws) socket.current = null;
      if (closedOnPurpose) return;
      setStatus("connecting");
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** failures.current) * (0.75 + Math.random() * 0.5);
      failures.current++;
      retryTimer = window.setTimeout(() => setAttempt((a) => a + 1), delay);
    };

    return () => {
      closedOnPurpose = true;
      window.clearTimeout(retryTimer);
      ws.close();
      if (socket.current === ws) socket.current = null;
    };
  }, [username, url, haveLocation, attempt, sendLocation]);

  // tell the server when I've moved
  useEffect(() => {
    sendLocation(false);
  }, [geo.lat, geo.lng, sendLocation]);

  // phones suspend background tabs: when the app is visible again, reconnect now instead of waiting
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const ws = socket.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        failures.current = 0;
        setAttempt((a) => a + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const subscribe = useCallback((fn: (m: LiveMessage) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const value = useMemo(() => ({ status, subscribe }), [status, subscribe]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);

/** Call `fn` for every live message while the component is mounted. */
export function useLiveMessages(fn: (m: LiveMessage) => void): void {
  const { subscribe } = useLive();
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => subscribe((m) => latest.current(m)), [subscribe]);
}
