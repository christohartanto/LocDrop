// FE-2: the phone's location. Uses the dev override (FE-11) when one is set.
// One shared GPS watch for the whole app: every screen (and the live connection, FE-10) reads the same
// latest position, so opening a screen never waits for a fresh fix. The watch stops when nothing uses it.

import { useSyncExternalStore } from "react";
import { useFakeLocation } from "../dev/fakeLocation";

export type GeoStatus = "loading" | "ok" | "denied" | "unavailable";

export interface Geo {
  status: GeoStatus;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  isFake: boolean;
}

type Real = Omit<Geo, "isFake">;

let current: Real = { status: "loading", lat: null, lng: null, accuracyM: null };
const listeners = new Set<() => void>();
let watchId: number | null = null;

function publish(next: Real) {
  current = next;
  for (const fn of listeners) fn();
}

function startWatch() {
  if (!("geolocation" in navigator)) {
    publish({ status: "unavailable", lat: null, lng: null, accuracyM: null });
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) =>
      publish({
        status: "ok",
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: Math.round(pos.coords.accuracy),
      }),
    (err) =>
      publish({
        ...current,
        status: err.code === err.PERMISSION_DENIED ? "denied" : current.status === "ok" ? "ok" : "unavailable",
      }),
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
  );
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  if (watchId === null && listeners.size === 1) startWatch();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null; // keep `current`: the next screen starts from the last known position
    }
  };
}

const noSubscribe = () => () => {};
const snapshot = () => current;

export function useGeolocation(): Geo {
  const fake = useFakeLocation();
  const real = useSyncExternalStore(fake ? noSubscribe : subscribe, snapshot);
  if (fake) return { status: "ok", lat: fake.lat, lng: fake.lng, accuracyM: 5, isFake: true };
  return { ...real, isFake: false };
}
