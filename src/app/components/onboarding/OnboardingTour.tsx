"use client";

import React, { useEffect, useMemo, useState } from "react";
import { GlossaryText, TechTerm } from "@/components/glossary/Glossary";

export type OnboardingTourProps = {
  open?: boolean;
  onClose?: () => void;
};

const LS_KEY = "aura_onboarded_v1";

type Slide = { title: string; body: React.ReactNode; visual?: React.ReactNode };

function useDefaultOpen(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState<boolean>(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const shouldOpen = raw !== "done";
      if (shouldOpen) setOpen(true);
    } catch { /* noop */ }
  }, []);
  return [open, setOpen];
}

export default function OnboardingTour(props: OnboardingTourProps) {
  const [defaultOpen, setDefaultOpen] = useDefaultOpen();
  const controlled = typeof props.open === "boolean";
  const isOpen = controlled ? !!props.open : defaultOpen;

  const slides: Slide[] = useMemo(() => [
    {
      title: "Desinformación y miedo a invertir",
      body: (
        <>
          <GlossaryText text="Millones evitan invertir por falta de conocimiento o miedo a perder dinero. Las plataformas actuales están hechas para expertos, no para principiantes. Resultado: decisiones impulsivas y pérdida de oportunidades." />
          <div className="mt-3 text-xs opacity-80">Visual sugerido: usuario confundido frente a gráficos caóticos.</div>
        </>
      ),
    },
    {
      title: "AURA: tu asistente predictivo",
      body: (
        <>
          <GlossaryText text="AURA recomienda oportunidades en tiempo real usando un modelo híbrido CNN–LSTM. Analiza tendencias, volatilidad y señales técnicas para ofrecer predicciones y nivel de certeza en lenguaje simple." />
          <div className="mt-3 text-xs opacity-80">Visual sugerido: mockup móvil con predicciones (Compra, Espera, Vende).</div>
        </>
      ),
    },
    {
      title: "Del dato al consejo en segundos",
      body: (
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Recibimos datos del mercado (acciones, criptomonedas, ETFs).</li>
          <li>El modelo <TechTerm term="cnn–lstm" /> identifica patrones y <TechTerm term="volatilidad" />.</li>
          <li>Generamos una recomendación explicada con claridad.</li>
          <li>Simulas tu inversión antes de decidir.</li>
        </ul>
      ),
    },
    {
      title: "Propuesta de valor",
      body: (
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Lenguaje sin tecnicismos y visual simple.</li>
          <li>Predicciones transparentes y explicadas.</li>
          <li>Modelo freemium accesible.</li>
          <li>Seguridad y escalabilidad en AWS serverless.</li>
        </ul>
      ),
    },
    {
      title: "Por qué AURA es diferente",
      body: (
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Arquitectura <TechTerm term="cnn–lstm" /> con estimación de <TechTerm term="incertidumbre" />.</li>
          <li>Entrenamiento continuo con datos reales.</li>
          <li>Recomendaciones adaptadas al perfil del usuario.</li>
          <li>Integración con simulador para aprendizaje.</li>
        </ul>
      ),
    },
    {
      title: "Empieza a invertir con confianza",
      body: (
        <>
          <p className="text-sm">AURA acompaña a usuarios sin experiencia para tomar decisiones informadas y con sentido. Explora y deja que la IA te guíe.</p>
          <div className="mt-3 text-xs opacity-80">Visual sugerido: usuario mirando su celular con satisfacción (fondo digital de mercado).</div>
        </>
      ),
    },
  ], []);

  const [idx, setIdx] = useState(0);
  const total = slides.length;

  useEffect(() => {
    if (!isOpen) return;
    // accesibilidad: esc para cerrar
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") close(); if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft") prev(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, idx]);

  function close() {
    try { localStorage.setItem(LS_KEY, "done"); } catch { /* noop */ }
    if (controlled) props.onClose?.(); else setDefaultOpen(false);
  }
  function next() { setIdx(i => Math.min(total - 1, i + 1)); }
  function prev() { setIdx(i => Math.max(0, i - 1)); }

  if (!isOpen) return null;

  return (
    <div>
      <div className="aura-onboard__backdrop" onClick={close} />
      <div className="aura-onboard__panel" role="dialog" aria-modal="true" aria-label="Tour de AURA">
        <div className="aura-onboard__card fade-in-up">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="aura-onboard__title">AURA — Presentación</div>
              <div className="aura-onboard__subtitle">Un sistema predictivo de inversión basado en IA</div>
            </div>
            <button className="btn btn-ghost" onClick={close} aria-label="Cerrar">Cerrar</button>
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-4">
            <div className="text-lg font-semibold mb-2">{slides[idx].title}</div>
            <div className="text-sm leading-relaxed">{slides[idx].body}</div>
          </div>

          <div className="aura-onboard__footer">
            <div className="aura-onboard__dots">
              {Array.from({ length: total }).map((_, i) => (
                <span key={i} className={`aura-onboard__dot ${i === idx ? 'is-active' : ''}`} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button className="btn" onClick={prev} disabled={idx === 0}>Anterior</button>
              {idx < total - 1 ? (
                <button className="btn btn-primary" onClick={next}>Siguiente</button>
              ) : (
                <button className="btn btn-primary" onClick={close}>Empezar</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

