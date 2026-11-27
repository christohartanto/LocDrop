// FE-8: groups. Create one (you get a join code to share), join one with a code, see the ones you're in.
// Group notes are only visible to members, so this is where you invite friends.

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api/client";
import { friendlyError } from "../api/errors";
import type { Group } from "../api/types";
import { CopyIcon } from "../components/icons";
import { useToast } from "../components/Toast";
import { EmptyState, Hint, Spinner } from "../components/ui";

const NAME_MAX = 40;
const CODE_LENGTH = 6;
const cleanCode = (s: string) => s.replace(/[\s-]/g, "").toUpperCase();

/** "ABC234" → "ABC 234": easier to read out loud. */
const prettyCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false; // e.g. plain-http phone mode, or permission denied
  }
}

export function GroupsPage() {
  const toast = useToast();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null); // groupId to highlight after create/join

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setGroups((await api.listGroups()).groups);
      setLoadError(null);
    } catch (err) {
      setLoadError(friendlyError(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const trimmedName = name.trim();
  const canCreate = trimmedName.length > 0 && trimmedName.length <= NAME_MAX && !creating;
  const canJoin = cleanCode(code).length === CODE_LENGTH && !joining;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    setCreating(true);
    setCreateError(null);
    try {
      const g = await api.createGroup(trimmedName);
      setName("");
      setFresh(g.groupId);
      toast(`👥 "${g.name}" created. Share code ${prettyCode(g.joinCode)}`);
      await load();
    } catch (err) {
      setCreateError(friendlyError(err));
    } finally {
      setCreating(false);
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    if (!canJoin) return;
    setJoining(true);
    setJoinError(null);
    try {
      const g = await api.joinGroup(cleanCode(code));
      setCode("");
      setFresh(g.groupId);
      const already = groups?.some((x) => x.groupId === g.groupId);
      toast(already ? `You're already in "${g.name}"` : `🎉 You joined "${g.name}"`);
      await load();
    } catch (err) {
      setJoinError(
        err instanceof ApiError && err.code === "NOT_FOUND"
          ? "No group has that code. Check it with the person who shared it."
          : friendlyError(err),
      );
    } finally {
      setJoining(false);
    }
  }

  async function onCopy(g: Group) {
    toast((await copyText(g.joinCode)) ? `Code ${prettyCode(g.joinCode)} copied` : `Code: ${prettyCode(g.joinCode)}`);
  }

  return (
    <section className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Groups</h1>
          <p className="page__sub">Drop notes only your group can find</p>
        </div>
      </div>

      <div className="groupforms">
        <form className="groupform" onSubmit={onJoin}>
          <label className="field">
            <span className="field__label">Join with a code</span>
            <span className="groupform__row">
              <input
                className="field__input groupform__code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setJoinError(null);
                }}
                placeholder="ABC 234"
                maxLength={CODE_LENGTH + 2}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="join-rule"
              />
              <button className="btn btn--primary" disabled={!canJoin}>
                {joining ? "Joining…" : "Join"}
              </button>
            </span>
            <span className="field__rule" id="join-rule">
              6 letters or numbers, from a friend
            </span>
          </label>
          {joinError && <Hint>{joinError}</Hint>}
        </form>

        <form className="groupform" onSubmit={onCreate}>
          <label className="field">
            <span className="field__label">Start a new group</span>
            <span className="groupform__row">
              <input
                className="field__input"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setCreateError(null);
                }}
                placeholder="e.g. Study buddies"
                maxLength={NAME_MAX + 10}
                autoComplete="off"
              />
              <button className="btn btn--coral" disabled={!canCreate}>
                {creating ? "Creating…" : "Create"}
              </button>
            </span>
            <span className={`field__rule ${trimmedName.length > NAME_MAX ? "is-over" : ""}`}>
              {trimmedName.length > NAME_MAX ? `Too long: ${trimmedName.length} / ${NAME_MAX}` : "You'll get a code to share"}
            </span>
          </label>
          {createError && <Hint>{createError}</Hint>}
        </form>
      </div>

      <h2 className="groups__heading">Your groups{groups && groups.length > 0 ? ` · ${groups.length}` : ""}</h2>

      {loadError && <Hint>{loadError}</Hint>}
      {groups === null && !loadError && <Spinner />}
      {groups !== null && groups.length === 0 && (
        <EmptyState
          title="No groups yet"
          text="Start one and share its code, or join a friend's with theirs."
        />
      )}

      {groups !== null && groups.length > 0 && (
        <ul className="list list--cards">
          {groups.map((g) => (
            <li key={g.groupId} className={`groupcard ${fresh === g.groupId ? "is-fresh" : ""}`}>
              <div className="groupcard__body">
                <span className="groupcard__name">👥 {g.name}</span>
                <span className="groupcard__hint">Invite code</span>
                <span className="groupcard__code" aria-label={`Join code ${g.joinCode.split("").join(" ")}`}>
                  {prettyCode(g.joinCode)}
                </span>
              </div>
              <button className="btn btn--small btn--ghost groupcard__copy" onClick={() => void onCopy(g)}>
                <CopyIcon size={16} /> Copy
              </button>
            </li>
          ))}
        </ul>
      )}

      {groups !== null && groups.length > 0 && (
        <p className="groups__tip">
          Tip: turn on <strong>👥 Group only</strong> when you <Link to="/new">drop a note</Link>.
        </p>
      )}
    </section>
  );
}
