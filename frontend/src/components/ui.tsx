// Small reusable UI pieces.

import type { ReactNode } from "react";
import { InfoIcon } from "./icons";

export function Toggle(props: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`toggle ${props.disabled ? "is-disabled" : ""}`}>
      <span className="toggle__text">
        <span className="toggle__label">{props.label}</span>
        {props.hint && <span className="toggle__hint">{props.hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
    </label>
  );
}

export function EmptyState(props: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__art" aria-hidden="true">
        <span>📍</span>
      </div>
      <h2 className="empty__title">{props.title}</h2>
      <p className="empty__text">{props.text}</p>
      {props.action}
    </div>
  );
}

export function InfoCard(props: { title: string; children: ReactNode; tone?: "warn" | "info" }) {
  return (
    <div className={`infocard infocard--${props.tone ?? "info"}`} role="status">
      <div className="infocard__icon" aria-hidden="true">
        {props.tone === "warn" ? "📍" : <InfoIcon size={20} />}
      </div>
      <div>
        <div className="infocard__title">{props.title}</div>
        <div className="infocard__text">{props.children}</div>
      </div>
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="hint" role="alert">
      <InfoIcon size={16} /> <span>{children}</span>
    </p>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner__dot" />
      <span className="spinner__dot" />
      <span className="spinner__dot" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
