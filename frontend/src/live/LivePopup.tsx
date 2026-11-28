// FE-10: the "New note nearby!" banner. Shows on any screen when a note_nearby arrives;
// "See it" opens the map with that pin selected. Hides itself after a few seconds.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { NoteSummary } from "../api/types";
import { formatAway } from "../lib/format";
import { useLiveMessages } from "./LiveProvider";

const SHOW_MS = 8000;

export function LivePopup() {
  const navigate = useNavigate();
  const [note, setNote] = useState<NoteSummary | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useLiveMessages((m) => {
    if (m.type === "note_nearby") {
      setNote(m.note);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setNote(null), SHOW_MS);
      try {
        navigator.vibrate?.(60);
      } catch {
        /* not allowed: fine */
      }
    } else if (m.type === "note_gone") {
      setNote((n) => (n?.id === m.id ? null : n));
    }
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!note) return null;
  const from = note.authorName ?? "someone anonymous";
  return (
    <div className="livepop" role="status" aria-live="polite">
      <span className={`livepop__icon ${note.burnOnRead ? "is-fire" : ""}`} aria-hidden="true">
        {note.burnOnRead ? "🔥" : note.visibility === "group" ? "👥" : "✉"}
      </span>
      <span className="livepop__body">
        <strong>New note nearby!</strong>
        <span>
          From {from} · {formatAway(note.distanceM)}
          {note.burnOnRead ? " · first reader only" : ""}
        </span>
      </span>
      <button
        className="btn btn--small btn--coral"
        onClick={() => {
          setNote(null);
          navigate("/", { state: { focus: note.id } });
        }}
      >
        See it
      </button>
      <button className="livepop__close" onClick={() => setNote(null)} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
