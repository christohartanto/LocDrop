// FE-4: open a note. Sends my CURRENT location; shows only what the server returns.
// "Delete after first read" notes get a confirm step so nobody burns one by accident.

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { friendlyError } from "../api/errors";
import type { NoteDetail, NoteSummary } from "../api/types";
import { useSession } from "../auth/session";
import { BackIcon } from "../components/icons";
import { Hint, InfoCard, Spinner } from "../components/ui";
import { useGeolocation } from "../hooks/useGeolocation";
import { formatDistance, timeAgo } from "../lib/format";

type View =
  | { kind: "confirm" }
  | { kind: "opening" }
  | { kind: "open"; note: NoteDetail }
  | { kind: "error"; message: string; code: string };

export function NotePage() {
  const { id = "" } = useParams();
  const summary = (useLocation().state as { summary?: NoteSummary } | null)?.summary;
  const navigate = useNavigate();
  const geo = useGeolocation();
  const { refreshMe } = useSession();
  const [view, setView] = useState<View>(summary?.burnOnRead ? { kind: "confirm" } : { kind: "opening" });
  const started = useRef(false); // the automatic open has happened (or a manual one replaced it)
  const inFlight = useRef(false); // never send two opens at once: a 2nd open of a burn note would get 410

  const open = useCallback(async () => {
    if (geo.lat === null || geo.lng === null || inFlight.current) return;
    started.current = true;
    inFlight.current = true;
    setView({ kind: "opening" });
    try {
      const note = await api.openNote(id, geo.lat, geo.lng);
      setView({ kind: "open", note });
      if (note.consumedByThisRead) void refreshMe();
    } catch (err) {
      setView({
        kind: "error",
        message: friendlyError(err),
        code: err instanceof ApiError ? err.code : "INTERNAL",
      });
    } finally {
      inFlight.current = false;
    }
  }, [id, geo.lat, geo.lng, refreshMe]);

  // Non-burn notes open straight away (once), as soon as we know where I am.
  // Burn notes start in "confirm" and only open when the reader taps "Read it now".
  useEffect(() => {
    if (view.kind !== "opening" || started.current || geo.status !== "ok") return;
    void open();
  }, [view.kind, geo.status, open]);

  const header = summary
    ? `${summary.authorName ?? "Anonymous"} · ${formatDistance(summary.distanceM)} away`
    : "A note";

  return (
    <section className="page page--note">
      <button className="backlink" onClick={() => navigate("/")}>
        <BackIcon size={18} /> Map
      </button>

      {geo.status === "denied" && (
        <InfoCard title="Location is off" tone="warn">
          LocDrop needs your location to check you're close enough to read this note.
        </InfoCard>
      )}
      {geo.status === "loading" && <Spinner label="Finding your location…" />}

      {geo.status === "ok" && view.kind === "confirm" && (
        <div className="notecard">
          <div className="notecard__head">{header}</div>
          <div className="notecard__body notecard__body--center">
            <div className="notecard__fire" aria-hidden="true">
              🔥
            </div>
            <p className="notecard__ask">This note disappears after the first read.</p>
            <p className="notecard__small">If you're first, you'll be the only person who ever sees it.</p>
          </div>
          <div className="notecard__actions">
            <button className="btn btn--primary btn--block" onClick={() => void open()}>
              Read it now
            </button>
          </div>
        </div>
      )}

      {view.kind === "opening" && geo.status === "ok" && <Spinner label="Opening note…" />}

      {view.kind === "open" && (
        <>
          <div className="notecard notecard--reveal">
            <div className="notecard__head">
              {view.note.authorName ?? "Anonymous"} · {formatDistance(view.note.distanceM)} away
            </div>
            <div className="notecard__body">
              <p className="notecard__text">{view.note.text}</p>
              <p className="notecard__time">Dropped {timeAgo(view.note.createdAt)}</p>
            </div>
          </div>
          {view.note.consumedByThisRead && (
            <div className="burned">
              <span aria-hidden="true">🔥</span> You were the first reader. This note is now gone for everyone else.
            </div>
          )}
          <button className="btn btn--soft btn--block" onClick={() => navigate("/")}>
            Back to map
          </button>
        </>
      )}

      {view.kind === "error" && (
        <div className="notecard notecard--muted">
          <div className="notecard__head">{header}</div>
          <div className="notecard__body notecard__body--center">
            <div className="notecard__fire" aria-hidden="true">
              {view.code === "OUT_OF_RANGE" ? "🚶" : view.code === "NOTE_GONE" ? "💨" : "🤔"}
            </div>
            <Hint>{view.message}</Hint>
          </div>
          <div className="notecard__actions">
            {view.code === "OUT_OF_RANGE" ? (
              <button className="btn btn--primary btn--block" onClick={() => void open()}>
                I moved closer, try again
              </button>
            ) : (
              <button className="btn btn--soft btn--block" onClick={() => navigate("/")}>
                Back to map
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
