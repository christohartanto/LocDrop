// The live map: tilted, follows the player as they walk (like a walking navigation / Pokémon Go),
// with a 100 m range ring and note pins. You can rotate and zoom, but the map stays centred on you.
// If the map can't start or load (no WebGL, map service unreachable), onFail() switches to the radar.

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MlMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// The map does its heavy work in a background worker. Vite bundles it and gives us its address.
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef, useState } from "react";
import type { NoteSummary } from "../api/types";
import { offsetMeters } from "../lib/geo";
import { pinClass, pinHtml, pinLabel, playerHtml } from "./Pins";
import { adventureStyle } from "./style";

maplibregl.setWorkerUrl(mapWorkerUrl);

const HOME = { zoom: 17.7, pitch: 58, bearing: 0 };
const LOAD_TIMEOUT_MS = 12_000;

function ring(lat: number, lng: number, radiusM: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * 2 * Math.PI;
    const p = offsetMeters(lat, lng, Math.cos(a) * radiusM, Math.sin(a) * radiusM);
    pts.push([p.lng, p.lat]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [pts] } };
}

export interface GameMapProps {
  lat: number;
  lng: number;
  radiusM: number;
  initial: string; // first letter of the username, shown on the player marker
  notes: NoteSummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  recenter: number; // change this number to snap back to the default view
  onFail: () => void;
}

export function GameMap(props: GameMapProps) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const player = useRef<Marker | null>(null);
  const pins = useRef(new Map<string, Marker>());
  const loaded = useRef(false);
  const [ready, setReady] = useState(false);
  const latest = useRef(props);
  latest.current = props;

  // create the map once
  useEffect(() => {
    let m: MlMap;
    try {
      m = new maplibregl.Map({
        container: holder.current!,
        style: adventureStyle,
        center: [latest.current.lng, latest.current.lat],
        ...HOME,
        minZoom: 15.5,
        maxZoom: 19.5,
        maxPitch: 70,
        dragPan: false, // the map follows you; rotate and zoom are allowed
        keyboard: false,
        attributionControl: false,
      });
    } catch {
      latest.current.onFail();
      return;
    }
    map.current = m;
    if (import.meta.env.DEV) (window as unknown as { __locdropMap?: MlMap }).__locdropMap = m; // for debugging in dev only
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    m.touchZoomRotate.enable({ around: "center" });
    m.scrollZoom.enable({ around: "center" });

    const timeout = window.setTimeout(() => {
      if (!tilesArrived) latest.current.onFail();
    }, LOAD_TIMEOUT_MS);

    // Our style is built into the app, so "load" fires even when the map service is unreachable.
    // What matters is whether street data arrives: if it doesn't (or the service errors first), use the radar.
    let tilesArrived = false;
    m.on("sourcedata", (e) => {
      if (e.sourceId === "world" && e.isSourceLoaded && !tilesArrived) tilesArrived = true;
    });
    m.on("error", (e) => {
      const sourceId = (e as unknown as { sourceId?: string }).sourceId;
      if (!tilesArrived && (sourceId === "world" || String(e.error?.message ?? "").includes("openfreemap"))) {
        window.clearTimeout(timeout);
        latest.current.onFail();
      }
    });

    m.on("load", () => {
      loaded.current = true;
      window.clearTimeout(timeout);
      const p = latest.current;
      m.addSource("range", { type: "geojson", data: ring(p.lat, p.lng, p.radiusM) });
      m.addLayer({ id: "range-fill", type: "fill", source: "range", paint: { "fill-color": "#ffffff", "fill-opacity": 0.22 } });
      m.addLayer({
        id: "range-line",
        type: "line",
        source: "range",
        paint: { "line-color": "#ff7a45", "line-width": 3, "line-dasharray": [1.5, 1.5] },
        layout: { "line-cap": "round" },
      });
      setReady(true);
    });
    m.on("click", () => latest.current.onSelect(null));

    const el = document.createElement("div");
    el.className = "player";
    el.innerHTML = playerHtml(latest.current.initial);
    player.current = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([latest.current.lng, latest.current.lat])
      .addTo(m);

    return () => {
      window.clearTimeout(timeout);
      pins.current.clear();
      m.remove();
      map.current = null;
    };
  }, []);

  // follow the player
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    player.current?.setLngLat([props.lng, props.lat]);
    m.easeTo({ center: [props.lng, props.lat], duration: 900 });
    const update = () => (m.getSource("range") as GeoJSONSource | undefined)?.setData(ring(props.lat, props.lng, props.radiusM));
    if (loaded.current) update();
    else m.once("load", update);
  }, [props.lat, props.lng, props.radiusM]);

  // snap back to the default view
  useEffect(() => {
    if (props.recenter > 0) map.current?.easeTo({ center: [latest.current.lng, latest.current.lat], ...HOME, duration: 700 });
  }, [props.recenter]);

  // note pins
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const n of props.notes) {
      seen.add(n.id);
      let marker = pins.current.get(n.id);
      if (!marker) {
        const el = document.createElement("button");
        el.type = "button";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          latest.current.onSelect(n.id);
        });
        const created = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([n.lng, n.lat]).addTo(m);
        pins.current.set(n.id, created);
        marker = created;
      }
      const el = marker.getElement();
      el.className = `${pinClass(n, n.id === props.selectedId)} maplibregl-marker maplibregl-marker-anchor-bottom`;
      el.setAttribute("aria-label", pinLabel(n));
      el.innerHTML = pinHtml(n);
    }
    for (const [id, marker] of pins.current) {
      if (!seen.has(id)) {
        marker.remove();
        pins.current.delete(id);
      }
    }
  }, [props.notes, props.selectedId]);

  // The outer box is positioned by our CSS; MapLibre styles the inner one (its CSS would otherwise
  // override our absolute positioning and collapse the map to 0 px high).
  return (
    <div className={`gamemap ${ready ? "is-ready" : ""}`} aria-label="Map of your surroundings">
      <div ref={holder} className="gamemap__canvas" />
    </div>
  );
}
