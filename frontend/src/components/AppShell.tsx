// Game HUD for logged-in screens: logo + "x / N notes" pouch (FE-6) on top, and the bottom
// action bar (Map / big Drop button / My notes). On the map screen the HUD floats over the map.

import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../auth/session";
import { LogoutIcon, MapIcon, NotesIcon, PinIcon, PlusIcon } from "./icons";

export function Logo() {
  return (
    <span className="logo">
      <span className="logo__pin" aria-hidden="true">
        <PinIcon size={18} />
      </span>
      LocDrop
    </span>
  );
}

export function SlotCounter() {
  const { me } = useSession();
  if (!me) return null;
  const full = me.activeNoteCount >= me.maxActiveNotes;
  return (
    <span className={`slots ${full ? "is-full" : ""}`} title="Active notes you have out there">
      <span className="slots__dots" aria-hidden="true">
        {Array.from({ length: me.maxActiveNotes }, (_, i) => (
          <span key={i} className={i < me.activeNoteCount ? "on" : ""} />
        ))}
      </span>
      {me.activeNoteCount} / {me.maxActiveNotes} notes
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { username, signOut } = useSession();
  const navigate = useNavigate();
  const onMap = useLocation().pathname === "/";
  return (
    <div className={`shell ${onMap ? "shell--map" : ""}`}>
      <header className="topbar">
        <Logo />
        <div className="topbar__right">
          <SlotCounter />
          <button
            className="iconbtn"
            onClick={() => {
              signOut();
              navigate("/login");
            }}
            aria-label={`Log out ${username ?? ""}`}
            title={`Log out (${username})`}
          >
            <LogoutIcon size={20} />
          </button>
        </div>
      </header>
      <main className="content">{children}</main>
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end className="tab">
          <MapIcon />
          <span>Map</span>
        </NavLink>
        <NavLink to="/new" className="tab tab--drop">
          <span className="tab__plus">
            <PlusIcon size={28} />
          </span>
          <span>Drop</span>
        </NavLink>
        <NavLink to="/mine" className="tab">
          <NotesIcon />
          <span>My notes</span>
        </NavLink>
      </nav>
    </div>
  );
}
