// FE-11: floating "📍 Dev" panel (only in `npm run dev`, never in a production build).

import { useState } from "react";
import { DEMO_CENTER, offsetMeters } from "../lib/geo";
import { setFakeLocation, useFakeLocation, type FakeLocation } from "./fakeLocation";

const at = (label: string, north: number, east: number): FakeLocation => ({
  label,
  ...offsetMeters(DEMO_CENTER.lat, DEMO_CENTER.lng, north, east),
});

const PRESETS: FakeLocation[] = [
  at("Demo center", 0, 0),
  at("50 m east", 0, 50),
  at("90 m east", 0, 90),
  at("150 m east (out of range)", 0, 150),
  at("300 m west", 0, -300),
];

export function LocationOverride() {
  const fake = useFakeLocation();
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState(String(DEMO_CENTER.lat));
  const [lng, setLng] = useState(String(DEMO_CENTER.lng));

  if (!import.meta.env.DEV) return null;

  const applyCustom = () => {
    const la = Number(lat);
    const ln = Number(lng);
    if (Number.isFinite(la) && Number.isFinite(ln)) setFakeLocation({ lat: la, lng: ln, label: "Custom" });
  };

  return (
    <div className="dev">
      {open && (
        <div className="dev__panel" role="dialog" aria-label="Fake location">
          <div className="dev__title">Fake location (dev only)</div>
          <button className={`dev__opt ${fake === null ? "is-on" : ""}`} onClick={() => setFakeLocation(null)}>
            Real GPS
          </button>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={`dev__opt ${fake?.label === p.label ? "is-on" : ""}`}
              onClick={() => setFakeLocation(p)}
            >
              {p.label}
            </button>
          ))}
          <div className="dev__custom">
            <input aria-label="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
            <input aria-label="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" />
            <button onClick={applyCustom}>Set</button>
          </div>
          <div className="dev__hint">Tip: use a private window to log in as a second user.</div>
        </div>
      )}
      <button className={`dev__fab ${fake ? "is-fake" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        📍 {fake ? fake.label : "Dev"}
      </button>
    </div>
  );
}
