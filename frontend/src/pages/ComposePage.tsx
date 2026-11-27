// FE-5 + FE-6: write a note at my current location. Blocked when all N slots are used.
// "Group only" picks one of my groups; only its members will see the note.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { friendlyError } from "../api/errors";
import type { Group } from "../api/types";
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
  const [groups, setGroups] = useState<Group[] | null>(null); // null = loading (or failed: then group notes are off)
  const [groupOnly, setGroupOnly] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropped, setDropped] = useState(false); // plays the pin-drop animation before leaving
  const mounted = useRef(true); // if the user leaves during the animation, don't pull them back
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    api
      .listGroups()
      .then((r) => {
        setGroups(r.groups);
        if (r.groups.length > 0) setGroupId(r.groups[0].groupId);
      })
      .catch(() => setGroups([]));
  }, []);

  const trimmed = text.trim();
  const remaining = MAX_CHARS - text.length;
  const full = me ? me.activeNoteCount >= me.maxActiveNotes : false;
  const haveLocation = geo.status === "ok" && geo.lat !== null && geo.lng !== null;
  const groupOk = !groupOnly || groupId !== "";
  const canDrop = trimmed.length > 0 && remaining >= 0 && haveLocation && !full && !busy && groupOk;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canDrop || geo.lat === null || geo.lng === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.createNote({
        text: trimmed,
        lat: geo.lat,
        lng: geo.lng,
        ...(groupOnly ? { visibility: "group" as const, groupId } : { visibility: "public" as const }),
        anonymous,
        burnOnRead,
      });
      await refreshMe();
      setDropped(true);
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      await new Promise((r) => setTimeout(r, reduceMotion ? 0 : 950));
      toast("📍 Note dropped!");
      if (mounted.current) navigate("/mine");
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
        <h1 className="compose__title">Drop a note here</h1>
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
        <div className="compose__foot">
          <span className="inkbar" aria-hidden="true">
            <span
              className={`inkbar__fill ${remaining < 0 ? "is-over" : remaining <= 20 ? "is-near" : ""}`}
              style={{ width: `${Math.min(100, (text.length / MAX_CHARS) * 100)}%` }}
            />
          </span>
          <span className={`compose__count ${remaining < 0 ? "is-over" : remaining <= 20 ? "is-near" : ""}`}>
            {text.length} / {MAX_CHARS}
          </span>
        </div>
      </div>

      <div className="settings">
        <Toggle
          label="🙈 Anonymous"
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
        <Toggle
          label="👥 Group only"
          hint={groupOnly ? "Only members of this group will see it" : "Only people in one of your groups will see it"}
          checked={groupOnly}
          onChange={setGroupOnly}
          disabled={full || groups === null}
        />
        {groupOnly && groups !== null && groups.length > 0 && (
          <label className="settings__pick">
            <span className="sr-only">Group</span>
            <select className="field__input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => (
                <option key={g.groupId} value={g.groupId}>
                  👥 {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {groupOnly && groups !== null && groups.length === 0 && (
          <p className="settings__pick settings__empty">
            You're not in any groups yet. <Link to="/groups">Create or join one</Link>
          </p>
        )}
      </div>

      {error && <Hint>{error}</Hint>}

      <p className="compose__where">
        {geo.status === "ok"
          ? `📍 Dropping at your current location${geo.accuracyM ? ` (±${geo.accuracyM} m)` : ""}`
          : geo.status === "denied"
            ? "📍 Location is off. Turn it on to drop a note."
            : "📍 Finding your location…"}
      </p>

      {dropped && (
        <div className="dropfx" role="status" aria-label="Note dropped">
          <span className="dropfx__pin" aria-hidden="true">
            <span className="pin__body">
              <span className="pin__glyph">✉</span>
            </span>
          </span>
          <span className="dropfx__ring" aria-hidden="true" />
          <span className="dropfx__text">Dropped!</span>
        </div>
      )}
    </form>
  );
}
