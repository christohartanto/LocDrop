// FE-5 + FE-6: write a note at my current location. Blocked when all N slots are used.

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { friendlyError } from "../api/errors";
import { useSession } from "../auth/session";
import { useToast } from "../components/Toast";
import { Hint, InfoCard, Toggle } from "../components/ui";
import { useGeolocation } from "../hooks/useGeolocation";

const MAX_CHARS = 280;

export function ComposePage() {
  const navigate = useNavigate();
  const geo = useGeolocation();
  const { me, refreshMe } = useSession();
  const toast = useToast();
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [burnOnRead, setBurnOnRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();
  const remaining = MAX_CHARS - text.length;
  const full = me ? me.activeNoteCount >= me.maxActiveNotes : false;
  const haveLocation = geo.status === "ok" && geo.lat !== null && geo.lng !== null;
  const canDrop = trimmed.length > 0 && remaining >= 0 && haveLocation && !full && !busy;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canDrop || geo.lat === null || geo.lng === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.createNote({ text: trimmed, lat: geo.lat, lng: geo.lng, visibility: "public", anonymous, burnOnRead });
      await refreshMe();
      toast("📍 Note dropped!");
      navigate("/mine");
    } catch (err) {
      setError(friendlyError(err));
      void refreshMe();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="page compose" onSubmit={onSubmit}>
      <div className="compose__bar">
        <button type="button" className="linkbtn" onClick={() => navigate(-1)}>
          Cancel
        </button>
        <h1 className="compose__title">New note</h1>
        <button className="btn btn--primary btn--small" disabled={!canDrop}>
          {busy ? "Dropping…" : "Drop"}
        </button>
      </div>

      {full && (
        <InfoCard title="All 5 notes are out there" tone="info">
          You can have {me?.maxActiveNotes} active notes at a time. <Link to="/mine">Recall one</Link> or wait for
          someone to read a "delete after first read" note.
        </InfoCard>
      )}

      <div className="compose__card">
        <textarea
          className="compose__text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's happening here?"
          maxLength={MAX_CHARS + 20}
          rows={6}
          disabled={full}
          aria-label="Note text"
          autoFocus
        />
        <div className={`compose__count ${remaining < 0 ? "is-over" : remaining <= 20 ? "is-near" : ""}`}>
          {text.length} / {MAX_CHARS}
        </div>
      </div>

      <div className="settings">
        <Toggle
          label="Anonymous"
          hint="Readers won't see your name"
          checked={anonymous}
          onChange={setAnonymous}
          disabled={full}
        />
        <Toggle
          label="Delete after first read 🔥"
          hint="Only the first person to open it can read it"
          checked={burnOnRead}
          onChange={setBurnOnRead}
          disabled={full}
        />
        <Toggle label="Group only" hint="Groups are coming soon" checked={false} onChange={() => {}} disabled />
      </div>

      {error && <Hint>{error}</Hint>}

      <p className="compose__where">
        {geo.status === "ok"
          ? `📍 Dropping at your current location${geo.accuracyM ? ` (±${geo.accuracyM} m)` : ""}`
          : geo.status === "denied"
            ? "📍 Location is off. Turn it on to drop a note."
            : "📍 Finding your location…"}
      </p>
    </form>
  );
}
