// FE-7: my notes with their status, and Recall for active ones.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { friendlyError } from "../api/errors";
import type { MyNote } from "../api/types";
import { useSession } from "../auth/session";
import { useToast } from "../components/Toast";
import { EmptyState, Hint, Spinner } from "../components/ui";
import { timeAgo } from "../lib/format";

const STATUS_LABEL: Record<MyNote["status"], string> = {
  active: "Active",
  consumed: "Read 🔥",
  recalled: "Recalled",
};

export function MyNotesPage() {
  const { refreshMe, me } = useSession();
  const toast = useToast();
  const [notes, setNotes] = useState<MyNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});

  useEffect(() => {
    api
      .listGroups()
      .then((r) => setGroupNames(Object.fromEntries(r.groups.map((g) => [g.groupId, g.name]))))
      .catch(() => {}); // tags just say "Group" then
  }, []);

  const load = useCallback(async () => {
    try {
      setNotes((await api.getMyNotes()).notes);
      setError(null);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function recall(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.recallNote(id);
      toast("Note recalled. Slot freed.");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusyId(null);
      setConfirmId(null);
      await Promise.all([load(), refreshMe()]);
    }
  }

  const active = notes?.filter((n) => n.status === "active").length ?? 0;

  return (
    <section className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Your drops</h1>
          <p className="page__sub">{notes ? `${active} active · ${notes.length} total` : "Your notes and their status"}</p>
        </div>
      </div>

      {me && (
        <div className="dropslots" aria-label={`${me.maxActiveNotes - me.activeNoteCount} drops left`}>
          <span className="dropslots__pins" aria-hidden="true">
            {Array.from({ length: me.maxActiveNotes }, (_, i) => (
              <span key={i} className={`dropslots__pin ${i < me.activeNoteCount ? "is-used" : ""}`} />
            ))}
          </span>
          <span className="dropslots__text">
            <strong>{me.maxActiveNotes - me.activeNoteCount}</strong>{" "}
            {me.maxActiveNotes - me.activeNoteCount === 1 ? "drop" : "drops"} left
          </span>
        </div>
      )}

      {error && <Hint>{error}</Hint>}
      {notes === null && !error && <Spinner />}
      {notes !== null && notes.length === 0 && (
        <EmptyState
          title="You haven't dropped any notes"
          text="Go somewhere fun and leave the first one."
          action={
            <Link to="/new" className="btn btn--soft">
              Write a note
            </Link>
          }
        />
      )}

      {notes !== null && notes.length > 0 && (
        <ul className="list list--cards">
          {notes.map((n) => (
            <li key={n.id} className={`mynote ${n.status !== "active" ? "is-done" : ""}`}>
              <span className={`stamp stamp--${n.status}`}>{STATUS_LABEL[n.status]}</span>
              <div className="mynote__top">
                <span className="mynote__time">Dropped {timeAgo(n.createdAt)}</span>
              </div>
              <p className="mynote__text">{n.text}</p>
              <div className="mynote__tags">
                {n.visibility === "group" && (
                  <span className="tag tag--group">👥 {(n.groupId && groupNames[n.groupId]) || "Group"}</span>
                )}
                {n.anonymous && <span className="tag">Anonymous</span>}
                {n.burnOnRead && <span className="tag">Delete after first read</span>}
                {n.status === "consumed" && n.consumedAt && <span className="tag">Read {timeAgo(n.consumedAt)}</span>}
              </div>
              {n.status === "active" &&
                (confirmId === n.id ? (
                  <div className="mynote__confirm">
                    <span>Take this note back?</span>
                    <button className="btn btn--small btn--ghost" onClick={() => setConfirmId(null)}>
                      Keep
                    </button>
                    <button
                      className="btn btn--small btn--danger"
                      onClick={() => void recall(n.id)}
                      disabled={busyId === n.id}
                    >
                      {busyId === n.id ? "Recalling…" : "Recall"}
                    </button>
                  </div>
                ) : (
                  <button className="btn btn--small btn--ghost mynote__recall" onClick={() => setConfirmId(n.id)}>
                    Recall
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
