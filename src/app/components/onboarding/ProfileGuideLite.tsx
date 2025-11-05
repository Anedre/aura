"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

const STATE_KEY = "aura_profile_intro_state_v1";

type Step = {
  id: string;
  title: string;
  detail: string;
  cta?: { label: string; action: () => void }[];
};

export default function ProfileGuideLite() {
  const path = usePathname();
  const [state, setState] = useState<{ seen: boolean; idx: number }>({ seen: false, idx: 0 });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STATE_KEY);
    if (raw) {
      try { setState(JSON.parse(raw)); } catch {}
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  const steps: Step[] = useMemo(() => ([
    {
      id: "favorite",
      title: "1/3 • Elige tu favorito",
      detail: "Tu activo clave siempre a mano en Inicio.",
      cta: [
        { label: "Abrir selector", action: () => window.dispatchEvent(new Event("aura:open-fav")) },
        { label: "Omitir", action: () => setState((s) => ({ ...s, idx: s.idx + 1 })) },
      ],
    },
    {
      id: "prefs",
      title: "2/3 • Ajusta tus alertas",
      detail: "Activa recordatorios simples para no perderte movimientos.",
      cta: [
        { label: "Ver preferencias", action: () => document.querySelector('[data-tour="profile-alerts"]')?.scrollIntoView({ behavior: "smooth", block: "start" }) },
        { label: "Siguiente", action: () => setState((s) => ({ ...s, idx: s.idx + 1 })) },
      ],
    },
    {
      id: "check",
      title: "3/3 • Completa el checklist",
      detail: "Marca 1-2 tareas para empezar con buen pie.",
      cta: [
        { label: "Ver checklist", action: () => document.querySelector('[data-tour="profile-checklist"]')?.scrollIntoView({ behavior: "smooth", block: "start" }) },
        { label: "Listo", action: () => setState({ seen: true, idx: 0 }) },
      ],
    },
  ]), []);

  // Mostrar sólo en /profile y si no se marcó como visto
  if (path !== "/profile" || state.seen) return null;
  const step = steps[Math.min(state.idx, steps.length - 1)];

  return (
    <div className="aura-profile-guide" role="status" aria-live="polite">
      <div className="aura-profile-guide__card">
        <div className="aura-profile-guide__title">{step.title}</div>
        <div className="aura-profile-guide__detail">{step.detail}</div>
        <div className="aura-profile-guide__actions">
          {step.cta?.map((c) => (
            <button key={c.label} className="aura-btn aura-btn--ghost" onClick={c.action}>{c.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
