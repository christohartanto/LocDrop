// FE-2 + FE-3 (redesigned): the live map. Shows where I am, my 100 m range, and the notes inside it.
// Refreshes on load, every 15 s, when I move > 20 m, and on demand.
// The server decides what is "in range"; this screen only draws what it returns.

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { friendlyError } from "../api/errors";
import type { NoteSummary } from "../api/types";
import { useSession } from "../auth/session";
import { CrosshairIcon, ListIcon, RefreshIcon } from "../components/icons";
import { Hint, InfoCard, Spinner } from "../components/ui";
import { useGeolocation } from "../hooks/useGeolocation";
import { formatDistance, timeAgo } from "../lib/format";
import { distanceM } from "../lib/geo";
import { GameMap } from "../map/GameMap";
import { Radar } from "../map/Radar";

const REFRESH_MS = 15_000;
const MOVE_M = 20;
const RADIUS_M = 100;

export function MapPage() {
  const geo = useGeolocation();
  const navigate = useNavigate();
  const { username } = useSession();
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [useRadar, setUseRadar] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const lastPos = useRef<{ lat: number; lng: number } | null>(null);

  const load = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    try {
      const res = await api.getNearby(lat, lng);
      setNotes(res.notes);
      setError(null);
      lastPos.current = { lat, lng };
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // first load + whenever I move more than 20 m
  useEffect(() => {
    if (geo.status !== "ok" || geo.lat === null || geo.lng === null) return;
    const prev = lastPos.current;
    if (!prev || distanceM(prev.lat, prev.lng, geo.lat, geo.lng) > MOVE_M) void load(geo.lat, geo.lng);
  }, [geo.status, geo.lat, geo.lng, load]);

  // every 15 s
  useEffect(() => {
    if (geo.status !== "ok" || geo.lat === null || geo.lng === null) return;
    const { lat, lng } = geo;
    const id = window.setInterval(() => void load(lat, lng), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [geo.status, geo.lat, geo.lng, load]);

  const selected = notes?.find((n) => n.id === selectedId) ?? null;
  const open = (n: NoteSummary) => navigate(`/note/${n.id}`, { state: { summary: n } });
  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setListOpen(false);
  }, []);
  const ready = geo.status === "ok" && geo.lat !== null && geo.lng !== null;
  const count = notes?.length ?? 0;

  return (
    <section className="mappage">
      <h1 className="sr-only">Map</h1>

      {ready &&
        (useRadar ? (
          <Radar lat={geo.lat!} lng={geo.lng!} radiusM={RADIUS_M} initial={(username ?? "?")[0].toUpperCase()} notes={notes ?? []} selectedId={selectedId} onSelect={select} />
        ) : (
          <GameMap
            lat={geo.lat!}
            lng={geo.lng!}
            radiusM={RADIUS_M}
            initial={(username ?? "?")[0].toUpperCase()}
            notes={notes ?? []}
            selectedId={selectedId}
            onSelect={select}
            recenter={recenter}
            onFail={() => setUseRadar(true)}
          />
        ))}

      {!ready && (
        <div className="mappage__wait">
          {geo.status === "denied" && (
            <InfoCard title="Location is off" tone="warn">
              LocDrop needs your location to show the map and the notes near you. Allow location for this site in your
              browser settings, then refresh the page.
            </InfoCard>
          )}
          {geo.status === "unavailable" && (
            <InfoCard title="Can't find your location" tone="warn">
              Your device didn't share a location. Check that location services are on, or try again outside.
            </InfoCard>
          )}
          {geo.status === "loading" && (
            <div className="mappage__locating">
              <Spinner label="Finding your location…" />
              <p>Finding you on the map…</p>
            </div>
          )}
        </div>
      )}

      {ready && (
        <>
          {/* status chip: how many notes are in range */}
          <div className="mapbar">
            <button className="chip chip--count" onClick={() => count > 0 && setListOpen((o) => !o)} aria-expanded={listOpen}>
              {notes === null ? (
                "Scanning…"
              ) : count === 0 ? (
                "No notes in range"
              ) : (
                <>
                  <ListIcon size={16} /> {count} {count === 1 ? "note" : "notes"} in range
                </>
              )}
            </button>
            <span className="chip chip--quiet">
              100 m range{geo.accuracyM ? ` · GPS ±${geo.accuracyM} m` : ""}
            </span>
          </div>

          <div className="mapfabs">
            <button
              className={`fab ${loading ? "is-spinning" : ""}`}
              onClick={() => geo.lat !== null && geo.lng !== null && void load(geo.lat, geo.lng)}
              aria-label="Refresh"
            >
              <RefreshIcon size={20} />
            </button>
            {!useRadar && (
              <button className="fab" onClick={() => setRecenter((r) => r + 1)} aria-label="Recenter the map">
                <CrosshairIcon size={20} />
              </button>
            )}
          </div>

          {error && (
            <div className="mappage__error">
              <Hint>{error}</Hint>
            </div>
          )}

          {notes !== null && count === 0 && !error && (
            <div className="mapcard mapcard--empty">
              <strong>No notes here, yet</strong>
              <span>Be the first to leave one at this spot.</span>
              <Link to="/new" className="btn btn--primary btn--small">
                Drop a note
              </Link>
            </div>
          )}

          {/* selected pin → preview card */}
          {selected && (
            <div className="mapcard" role="dialog" aria-label="Selected note">
              <div className="mapcard__row">
                <span className={`mapcard__icon ${selected.burnOnRead ? "is-fire" : ""}`} aria-hidden="true">
                  {selected.burnOnRead ? "🔥" : selected.authorName === null ? "?" : "✉"}
                </span>
                <span className="mapcard__body">
                  <span className={`mapcard__title ${selected.authorName ? "" : "is-anon"}`}>{selected.authorName ?? "Anonymous"}</span>
                  <span className="mapcard__meta">
                    {formatDistance(selected.distanceM)} · {timeAgo(selected.createdAt)}
                    {selected.burnOnRead ? " · disappears after first read" : ""}
                  </span>
                </span>
              </div>
              <button className="btn btn--primary btn--block" onClick={() => open(selected)}>
                Read note
              </button>
            </div>
          )}

          {/* list of everything in range */}
          {listOpen && notes && count > 0 && (
            <div className="sheet" role="dialog" aria-label="Notes in range">
              <div className="sheet__head">
                <strong>Notes in range</strong>
                <button className="linkbtn" onClick={() => setListOpen(false)}>
                  Close
                </button>
              </div>
              <ul className="sheet__list">
                {notes.map((n) => (
                  <li key={n.id}>
                    <button className="row" onClick={() => open(n)}>
                      <span className={`row__pin ${n.burnOnRead ? "is-fire" : ""}`} aria-hidden="true">
                        {n.burnOnRead ? "🔥" : n.authorName === null ? "?" : "✉"}
                      </span>
                      <span className="row__body">
                        <span className={`row__title ${n.authorName ? "" : "is-anon"}`}>{n.authorName ?? "Anonymous"}</span>
                        <span className="row__meta">
                          {formatDistance(n.distanceM)} · {timeAgo(n.createdAt)} · Tap to read
                        </span>
                      </span>
                      {n.burnOnRead && <span className="badge badge--fire">1 read</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
