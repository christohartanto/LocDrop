// Tiny toast ("Note dropped!") shown at the bottom for a few seconds.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

const ToastContext = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2800);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={`toast ${msg ? "is-on" : ""}`} role="status" aria-live="polite">
        {msg}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
