// FE-2: the phone's location. Uses the dev override (FE-11) when one is set.

import { useEffect, useState } from "react";
import { useFakeLocation } from "../dev/fakeLocation";

export type GeoStatus = "loading" | "ok" | "denied" | "unavailable";

export interface Geo {
  status: GeoStatus;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  isFake: boolean;
}

export function useGeolocation(): Geo {
  const fake = useFakeLocation();
  const [real, setReal] = useState<Omit<Geo, "isFake">>({ status: "loading", lat: null, lng: null, accuracyM: null });

  useEffect(() => {
    if (fake) return; // no need to ask the browser while faking
    if (!("geolocation" in navigator)) {
      setReal({ status: "unavailable", lat: null, lng: null, accuracyM: null });
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        setReal({
          status: "ok",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Math.round(pos.coords.accuracy),
        }),
      (err) =>
        setReal((prev) => ({
          ...prev,
          status: err.code === err.PERMISSION_DENIED ? "denied" : prev.status === "ok" ? "ok" : "unavailable",
        })),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [fake]);

  if (fake) return { status: "ok", lat: fake.lat, lng: fake.lng, accuracyM: 5, isFake: true };
  return { ...real, isFake: false };
}
