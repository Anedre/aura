"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Tip definition
export type CoachTip = {
  id: string; // unique per type (e.g., "fav-selected")
  title: string;
  detail?: string;
  cta?: { label: string; href?: string; action?: () => void }[];
  payload?: unknown;
  ttlMs?: number; // auto dismiss
};

const SHOWN_PREFIX = "aura_coach_tip_";

export default function PostActionCoach() {
  const router = useRouter();
  const [queue, setQueue] = useState<CoachTip[]>([]);
  const [visible, setVisible] = useState<CoachTip | null>(null);
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Append tip into queue with basic de-dup and rate limit per session/localStorage
  function enqueueTip(tip: CoachTip) {
    try {
      const key = SHOWN_PREFIX + tip.id;
      const times = Number(window.localStorage.getItem(key) || "0");
      if (times >= 2) return; // show at most twice
      window.localStorage.setItem(key, String(times + 1));
    } catch {}
    setQueue((q) => [...q, tip]);
  }

  // Show next tip when none visible
  useEffect(() => {
    if (visible || queue.length === 0) return;
    const next = queue[0];
    setVisible(next);
    setQueue((q) => q.slice(1));
    const ttl = next.ttlMs ?? 8000;
    if (hideT.current) clearTimeout(hideT.current);
    hideT.current = setTimeout(() => setVisible(null), ttl);
  }, [queue, visible]);

  useEffect(() => {
    const onFavSelected: EventListener = (ev) => {
      const ce = ev as CustomEvent<unknown>;
      const detail = ce?.detail;
      let symbol: string | undefined;
      if (typeof detail === "string") symbol = detail;
      else if (detail && typeof detail === "object") {
        const obj = detail as Record<string, unknown>;
        if (typeof obj.symbol === "string") symbol = obj.symbol;
        else if (typeof obj.value === "string") symbol = obj.value;
      }
      if (!symbol) return;
      enqueueTip({
        id: "fav-selected",
        title: `Favorito establecido: ${symbol}`,
        detail: "Ahora personalizaremos tu portada con este activo. Puedes abrir su ficha para ver precio en tiempo real y fundamentos.",
        cta: [
          { label: "Ver activo", action: () => router.push(`/asset/${encodeURIComponent(symbol)}`) },
          { label: "Entendido" },
        ],
        payload: { symbol },
        ttlMs: 9000,
      });
    };

    // Generic action-done channel
    const onActionDone: EventListener = (ev) => {
      const ce = ev as CustomEvent<unknown>;
      const d = ce?.detail;
      let id: string | undefined;
      if (d && typeof d === "object") {
        const obj = d as Record<string, unknown>;
        if (typeof obj.id === "string") id = obj.id;
      }
      if (!id) return;
      
      // Mapeo de eventos a tips
      if (id === "risk-completed") {
        enqueueTip({
          id: "risk-completed",
          title: "Perfil de riesgo actualizado",
          detail: "Tus sugerencias de inversión se adaptarán a tu tolerancia al riesgo.",
          cta: [
            { label: "Ver sugerencias", href: "/invest/request" },
            { label: "Entendido" },
          ],
          ttlMs: 9000,
        });
      } else if (id === "paper-trade") {
        enqueueTip({
          id: "paper-trade",
          title: "Trade simulado ejecutado",
          detail: "Practica sin riesgo. Revisa tu historial para analizar patrones y aprender.",
          cta: [
            { label: "Ver historial", href: "/paper" },
            { label: "Entendido" },
          ],
          ttlMs: 8000,
        });
      } else if (id === "alert-enabled") {
        enqueueTip({
          id: "alert-enabled",
          title: "Alerta activada",
          detail: "Te avisaremos cuando este activo se mueva significativamente.",
          cta: [{ label: "Entendido" }],
          ttlMs: 6000,
        });
      } else if (id === "checklist-done") {
        enqueueTip({
          id: "checklist-done",
          title: "¡Checklist completado!",
          detail: "Tu perfil está al 100%. Revisa estos pasos cada trimestre para mantener todo actualizado.",
          cta: [{ label: "Perfecto" }],
          ttlMs: 7000,
        });
      }
    };

    window.addEventListener("aura:fav-selected", onFavSelected);
    window.addEventListener("aura:action-done", onActionDone);
    return () => {
      window.removeEventListener("aura:fav-selected", onFavSelected);
      window.removeEventListener("aura:action-done", onActionDone);
    };
  }, [router]);

  const card = useMemo(() => {
    if (!visible) return null;
    type CoachAction = { label: string; href?: string; action?: () => void };
    const onClick = (cta: CoachAction) => (e: React.MouseEvent) => {
      e.preventDefault();
      if (cta.action) cta.action();
      else if (cta.href) router.push(cta.href);
      setVisible(null);
    };

    return (
      <div className="aura-coach" role="status" aria-live="polite">
        <div className="aura-coach__card">
          <div className="aura-coach__title">{visible.title}</div>
          {visible.detail && <div className="aura-coach__detail">{visible.detail}</div>}
          {visible.cta && (
            <div className="aura-coach__actions">
              {visible.cta.map((c, i) => (
                <button key={i} className="aura-btn aura-btn--ghost" onClick={onClick(c)}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }, [visible, router]);

  return card;
}
