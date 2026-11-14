// FE-2 + FE-3: notes near me. Refreshes on load, every 15 s, when I move > 20 m, and on Refresh.
// The server decides what is "near"; this screen just shows what it returns.

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { friendlyError } from "../api/errors";
import type { NoteSummary } from "../api/types";
import { PinIcon, RefreshIcon } from "../components/icons";
import { EmptyState, Hint, InfoCard, Spinner } from "../components/ui";
import { useGeolocation } from "../hooks/useGeolocation";
import { formatDistance, timeAgo } from "../lib/format";
import { distanceM } from "../lib/geo";

const REFRESH_MS = 15_000;
const MOVE_M = 20;

export function NearbyPage() {
  const geo = useGeolocation();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const lastPos = useRef<{ lat: number; lng: number } | null>(null);
  const [, setTick] = useState(0); // re-render "updated x ago"

  const load = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    try {
      const res = await api.getNearby(lat, lng);
      setNotes(res.notes);
      setError(null);
      setUpdatedAt(Date.now());
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
    const id = window.setInterval(() => {
      void load(lat, lng);
      setTick((t) => t + 1);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [geo.status, geo.lat, geo.lng, load]);

  const refresh = () => {
    if (geo.lat !== null && geo.lng !== null) void load(geo.lat, geo.lng);
  };

  return (
    <section className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Nearby</h1>
          <p className="page__sub">
            {geo.status === "ok"
              ? `Notes within 100 m of you${geo.accuracyM ? ` · GPS ±${geo.accuracyM} m` : ""}`
              : "Notes within 100 m of you"}
          </p>
        </div>
        {geo.status === "ok" && (
          <button className={`iconbtn iconbtn--soft ${loading ? "is-spinning" : ""}`} onClick={refresh} aria-label="Refresh">
            <RefreshIcon size={20} />
          </button>
        )}
      </div>

      {geo.status === "denied" && (
        <InfoCard title="Location is off" tone="warn">
          LocDrop needs your location to show notes near you. Allow location for this site in your browser settings, then
          refresh the page.
        </InfoCard>
      )}
      {geo.status === "unavailable" && (
        <InfoCard title="Can't find your location" tone="warn">
          Your device didn't share a location. Check that location services are on, or try again outside.
        </InfoCard>
      )}
      {geo.status === "loading" && <Spinner label="Finding your location…" />}

      {geo.status === "ok" && (
        <>
          {error && <Hint>{error}</Hint>}
          {notes === null && !error && <Spinner label="Looking for notes…" />}
          {notes !== null && notes.length === 0 && (
            <EmptyState
              title="No notes here, yet"
              text="Be the first to leave one at this spot."
              action={
                <Link to="/new" className="btn btn--soft">
                  Write a note
                </Link>
              }
            />
          )}
          {notes !== null && notes.length > 0 && (
            <ul className="list" aria-label="Notes near you">
              {notes.map((n) => (
                <li key={n.id}>
                  <button className="row" onClick={() => navigate(`/note/${n.id}`, { state: { summary: n } })}>
                    <span className="row__pin" aria-hidden="true">
                      <PinIcon size={18} />
                    </span>
                    <span className="row__body">
                      <span className="row__line">
                        <span className={`row__title ${n.authorName ? "" : "is-anon"}`}>{n.authorName ?? "Anonymous"}</span>
                        {n.burnOnRead && (
                          <span className="badge badge--fire" title="Disappears after the first read">
                            🔥 1 read
                          </span>
                        )}
                      </span>
                      <span className="row__meta">
                        {formatDistance(n.distanceM)} · {timeAgo(n.createdAt)} · Tap to read
                      </span>
                    </span>
                    <span className="row__chev" aria-hidden="true">
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {updatedAt && <p className="page__foot">Updated {timeAgo(new Date(updatedAt).toISOString())}</p>}
        </>
      )}
    </section>
  );
}
