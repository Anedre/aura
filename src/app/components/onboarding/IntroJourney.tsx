"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const INTRO_KEY = "aura_intro_seen_v1";

const slides = [
  {
    title: "Bienvenido a AURA",
    detail:
      "Tu asistente inteligente para invertir con claridad. Elimina el ruido y enfócate en lo que importa.",
    theme: "welcome",
  },
  {
    title: "Precios en tiempo real",
    detail:
      "Gráficos ligeros, feed en vivo y señales visuales claras. Todo sincronizado para que no pierdas oportunidades.",
    theme: "realtime",
  },
  {
    title: "Alertas simples",
    detail:
      "Configura notificaciones personalizadas cuando el mercado se mueve. Sin spam, solo lo relevante para ti.",
    theme: "alerts",
  },
  {
    title: "Aprende sin riesgo",
    detail:
      "Practica en modo paper trading y simula escenarios antes de invertir dinero real. Confianza desde el día uno.",
    theme: "learn",
  },
  {
    title: "Tu plan, a tu ritmo",
    detail:
      "Perfil de riesgo adaptado, checklist de progreso y guías breves dentro de la app. AURA evoluciona contigo.",
    theme: "personalized",
  },
];

export default function IntroJourney() {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem(INTRO_KEY) === "1";
      if (!seen) setOpen(true);
    } catch {}
  }, [path]);

  function closeIntro() {
    try { window.localStorage.setItem(INTRO_KEY, "1"); } catch {}
    setOpen(false);
  }

  const atLast = idx >= slides.length - 1;
  const slide = slides[idx];

  if (!open) return null;

  return (
    <div className="aura-intro" role="dialog" aria-modal="true" aria-label="Introducción">
      <div className="aura-intro__viewport">
        <div className="aura-intro__card" data-theme-slide={slide.theme}>
          <div className="aura-intro__illus" aria-hidden>
            <div className="aura-intro__blob aura-intro__blob--1" />
            <div className="aura-intro__blob aura-intro__blob--2" />
            <div className="aura-intro__spark" />
          </div>
          <div className="aura-intro__content">
            <div className="aura-intro__badge">AURA • {idx + 1}/{slides.length}</div>
            <h2 className="aura-intro__title">{slide.title}</h2>
            <p className="aura-intro__detail">{slide.detail}</p>
            <div className="aura-intro__nav">
              <div className="aura-intro__dots" aria-hidden>
                {slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Ir a slide ${i + 1}`}
                    className={`aura-intro__dot ${i === idx ? "is-active" : ""}`}
                    onClick={() => setIdx(i)}
                  />
                ))}
              </div>
              <div className="aura-intro__actions">
                {idx > 0 ? (
                  <button className="aura-btn aura-btn--ghost" onClick={() => setIdx((v) => Math.max(0, v - 1))}>Anterior</button>
                ) : (
                  <button className="aura-btn aura-btn--ghost" onClick={closeIntro}>Saltar todo</button>
                )}
                {!atLast ? (
                  <button className="aura-btn" onClick={() => setIdx((v) => Math.min(slides.length - 1, v + 1))}>Siguiente</button>
                ) : (
                  <button
                    className="aura-btn aura-btn--primary"
                    onClick={() => { closeIntro(); router.push("/profile"); }}
                  >
                    Empezar en mi perfil
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
