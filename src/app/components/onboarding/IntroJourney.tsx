"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const INTRO_KEY = "aura_intro_seen_v1";

const slides = [
  {
    title: "Invierte con calma",
    detail:
      "Aura simplifica el mercado: precios en vivo, señales claras y aprendizaje dentro de la app.",
  },
  {
    title: "Ve lo importante",
    detail:
      "Feed y gráficos ligeros, sin ruido. Configura alertas simples para reaccionar a tiempo.",
  },
  {
    title: "Aprende haciendo",
    detail:
      "Practica en modo paper y simula escenarios para ganar confianza antes de tomar decisiones.",
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
      // Solo mostrar en primeras visitas autenticadas y no en rutas internas específicas
      if (!seen) setOpen(true);
    } catch {}
  }, [path]);

  function closeIntro() {
    try { window.localStorage.setItem(INTRO_KEY, "1"); } catch {}
    setOpen(false);
  }

  const atLast = idx >= slides.length - 1;

  if (!open) return null;

  return (
    <div className="aura-intro" role="dialog" aria-modal="true" aria-label="Introducción">
      <div className="aura-intro__viewport">
        <div className="aura-intro__card">
          <div className="aura-intro__illus" aria-hidden>
            <div className="aura-intro__blob aura-intro__blob--1" />
            <div className="aura-intro__blob aura-intro__blob--2" />
            <div className="aura-intro__spark" />
          </div>
          <div className="aura-intro__content">
            <div className="aura-intro__badge">AURA</div>
            <h2 className="aura-intro__title">{slides[idx].title}</h2>
            <p className="aura-intro__detail">{slides[idx].detail}</p>
            <div className="aura-intro__nav">
              <div className="aura-intro__dots" aria-hidden>
                {slides.map((_, i) => (
                  <span key={i} className={`aura-intro__dot ${i === idx ? "is-active" : ""}`} />
                ))}
              </div>
              <div className="aura-intro__actions">
                {idx > 0 ? (
                  <button className="aura-btn aura-btn--ghost" onClick={() => setIdx((v) => Math.max(0, v - 1))}>Anterior</button>
                ) : (
                  <button className="aura-btn aura-btn--ghost" onClick={closeIntro}>Saltar</button>
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
