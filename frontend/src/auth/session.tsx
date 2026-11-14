// Login state + the "x / N notes used" counter (FE-6), shared by every screen.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setUnauthenticatedHandler, TOKEN_KEY } from "../api/client";
import type { AuthResponse, Me } from "../api/types";
import { readStorage, writeStorage } from "../lib/storage";

const USER_KEY = "locdrop_username";

interface Session {
  username: string | null;
  me: Me | null;
  signIn: (auth: AuthResponse) => void;
  signOut: () => void;
  refreshMe: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() =>
    readStorage(TOKEN_KEY) ? readStorage(USER_KEY) : null,
  );
  const [me, setMe] = useState<Me | null>(null);

  const signOut = useCallback(() => {
    writeStorage(TOKEN_KEY, null);
    writeStorage(USER_KEY, null);
    setUsername(null);
    setMe(null);
  }, []);

  const signIn = useCallback((auth: AuthResponse) => {
    writeStorage(TOKEN_KEY, auth.token);
    writeStorage(USER_KEY, auth.username);
    setUsername(auth.username);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api.getMe());
    } catch {
      /* 401 is handled globally; other errors just leave the counter as it was */
    }
  }, []);

  useEffect(() => {
    setUnauthenticatedHandler(signOut);
    return () => setUnauthenticatedHandler(null);
  }, [signOut]);

  useEffect(() => {
    if (username) void refreshMe();
  }, [username, refreshMe]);

  const value = useMemo(() => ({ username, me, signIn, signOut, refreshMe }), [username, me, signIn, signOut, refreshMe]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession must be used inside SessionProvider");
  return s;
}
