// FE-11: dev-only fake location, so we can test without walking around.
// A tiny store that components subscribe to with useSyncExternalStore.

import { useSyncExternalStore } from "react";
import { readStorage, writeStorage } from "../lib/storage";

export interface FakeLocation {
  lat: number;
  lng: number;
  label: string;
}

const KEY = "locdrop_dev_location";
const listeners = new Set<() => void>();

function load(): FakeLocation | null {
  if (!import.meta.env.DEV) return null;
  try {
    const raw = readStorage(KEY);
    const v = raw ? (JSON.parse(raw) as FakeLocation) : null;
    return v && Number.isFinite(v.lat) && Number.isFinite(v.lng) ? v : null;
  } catch {
    return null;
  }
}

let current: FakeLocation | null = load();

export function setFakeLocation(loc: FakeLocation | null) {
  current = loc;
  writeStorage(KEY, loc ? JSON.stringify(loc) : null);
  listeners.forEach((l) => l());
}

export function useFakeLocation(): FakeLocation | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
