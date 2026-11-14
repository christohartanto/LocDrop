// FE-1: Register and Login (username + password only, no email).

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { friendlyError } from "../api/errors";
import { useSession } from "../auth/session";
import { EyeIcon, PinIcon } from "../components/icons";
import { Hint } from "../components/ui";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const { signIn } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const cleanName = username.trim().toLowerCase();
  const nameOk = USERNAME_RE.test(cleanName);
  const pwOk = password.length >= 8 && password.length <= 72;
  const canSubmit = isRegister ? nameOk && pwOk : cleanName.length > 0 && password.length > 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = { username: cleanName, password };
      const auth = isRegister ? await api.register(body) : await api.login(body);
      signIn(auth);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? friendlyError(err) : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={onSubmit} noValidate>
        <div className="auth__icon" aria-hidden="true">
          <PinIcon size={30} />
        </div>
        <h1 className="auth__title">{isRegister ? "Create your account" : "Welcome back"}</h1>
        <p className="auth__lead">
          {isRegister
            ? "Leave notes at real places. Only people nearby can read them."
            : "Log in to see the notes around you."}
        </p>

        <label className="field">
          <span className="field__label">Username</span>
          <input
            className={`field__input ${touched && isRegister && !nameOk ? "is-bad" : ""}`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            placeholder="e.g. alice"
          />
          {isRegister && <span className="field__rule">3–20 characters: lowercase letters, numbers or _</span>}
        </label>

        <label className="field">
          <span className="field__label">Password</span>
          <span className="field__wrap">
            <input
              className={`field__input ${touched && isRegister && !pwOk ? "is-bad" : ""}`}
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"}
              maxLength={72}
            />
            <button
              type="button"
              className="field__eye"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              <EyeIcon size={20} off={showPw} />
            </button>
          </span>
          {isRegister && <span className="field__rule">At least 8 characters</span>}
        </label>

        {error && <Hint>{error}</Hint>}

        <button className="btn btn--primary btn--block" disabled={busy || (touched && !canSubmit)}>
          {busy ? "One moment…" : isRegister ? "Create account" : "Log in"}
        </button>

        <p className="auth__switch">
          {isRegister ? (
            <>
              Already have an account? <Link to="/login">Log in</Link>
            </>
          ) : (
            <>
              New here? <Link to="/register">Create an account</Link>
            </>
          )}
        </p>
        {import.meta.env.VITE_USE_MOCKS === "true" && (
          <p className="auth__demo">Mock mode · try alice / password123</p>
        )}
      </form>
    </div>
  );
}
