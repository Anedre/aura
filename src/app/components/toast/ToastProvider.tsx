"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Toast = { id: string; msg: string; kind?: "info"|"warning"|"error" };
type Ctx = { toast: (msg: string, kind?: Toast["kind"]) => void };
const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((msg: string, kind: Toast["kind"]="warning") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter(x => x.id !== id)), 3500);
  }, []);

  const ctx = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      {typeof window !== "undefined" &&
        createPortal(
          <div className="fixed top-4 right-4 z-[90] space-y-2">
            {toasts.map(t => (
              <div key={t.id}
                   className={`px-3 py-2 rounded-xl border text-sm shadow
                     ${t.kind === "error"   ? "bg-red-500/15 border-red-400/30 text-red-200" :
                       t.kind === "warning" ? "bg-amber-500/15 border-amber-400/30 text-amber-100" :
                                              "bg-white/10 border-white/20 text-white/90"}`}>
                {t.msg}
              </div>
            ))}
          </div>,
          document.body
        )
      }
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}
