"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const STATE_KEY = "aura_profile_intro_state_v1";

type Step = {
  id: string;
  title: string;
  detail: string;
  cta?: { label: string; action: () => void }[];
};

export default function ProfileGuideLite() {
  const router = useRouter();
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
      title: "1/5 • Elige tu favorito",
      detail: "Selecciona el activo que revisarás a diario.",
      cta: [
        { label: "Abrir selector", action: () => window.dispatchEvent(new Event("aura:open-fav")) },
        { label: "Siguiente →", action: () => setState((s) => ({ ...s, idx: s.idx + 1 })) },
      ],
    },
    {
      id: "home-filter",
      title: "2/5 • Filtra tu inicio",
      detail: "Prioriza cripto, forex o acciones en tu pantalla principal.",
      cta: [
        { label: "Ver filtro", action: () => document.querySelector('[data-tour="profile-home-filter"]')?.scrollIntoView({ behavior: "smooth", block: "start" }) },
        { label: "Siguiente →", action: () => setState((s) => ({ ...s, idx: s.idx + 1 })) },
      ],
    },
    {
      id: "prefs",
      title: "3/5 • Activa alertas",
      detail: "Recordatorios simples para no perderte cambios importantes.",
      cta: [
        { label: "Ver preferencias", action: () => document.querySelector('[data-tour="profile-alerts"]')?.scrollIntoView({ behavior: "smooth", block: "start" }) },
        { label: "Siguiente →", action: () => setState((s) => ({ ...s, idx: s.idx + 1 })) },
      ],
    },
    {
      id: "check",
      title: "4/5 • Completa el checklist",
      detail: "Marca 1-2 tareas clave para empezar con el pie derecho.",
      cta: [
        { label: "Ver checklist", action: () => document.querySelector('[data-tour="profile-checklist"]')?.scrollIntoView({ behavior: "smooth", block: "start" }) },
        { label: "Siguiente →", action: () => setState((s) => ({ ...s, idx: s.idx + 1 })) },
      ],
    },
    {
      id: "explore",
      title: "5/5 • Explora herramientas",
      detail: "Simulador, paper trading y asistente de riesgo están listos para ti.",
      cta: [
        { label: "Ir a simulador", action: () => router.push("/simulator") },
        { label: "Ir a paper", action: () => router.push("/paper") },
        { label: "Entendido", action: () => setState({ seen: true, idx: 0 }) },
      ],
    },
  ]), [router]);

  // Mostrar sólo en /profile y si no se marcó como visto
  if (path !== "/profile" || state.seen) return null;
  const step = steps[Math.min(state.idx, steps.length - 1)];
  const progress = Math.round(((state.idx + 1) / steps.length) * 100);

  return (
    <div className="aura-profile-guide" role="status" aria-live="polite">
      <div className="aura-profile-guide__card">
        <div className="aura-profile-guide__progress-bar">
          <div className="aura-profile-guide__progress-fill" style={{ ["--progress" as string]: `${progress}%` } as React.CSSProperties} />
        </div>
        <div className="aura-profile-guide__title">{step.title}</div>
        <div className="aura-profile-guide__detail">{step.detail}</div>
        <div className="aura-profile-guide__actions">
          {step.cta?.map((c) => (
            <button key={c.label} className="aura-btn aura-btn--ghost" onClick={c.action}>{c.label}</button>
          ))}
        </div>
        <button
          type="button"
          className="aura-profile-guide__skip"
          onClick={() => setState({ seen: true, idx: 0 })}
          aria-label="Saltar guía"
        >
          Saltar guía
        </button>
      </div>
    </div>
  );
}
