// app/components/onboarding/TutorialSteps.tsx
"use client";

import { useState } from "react";

/**
 * TutorialSteps - Tutorial de 3 pasos skippable (HU-A2)
 * 
 * Gherkin:
 * Given que veo el paso 1/3 del tutorial
 * When presiono "Siguiente" hasta el paso 3/3 y luego "Listo"
 * Then veo un toast "Tutorial completado"
 * And soy dirigido a Home
 */

interface TutorialStepsProps {
  onComplete: () => void;
  onSkip: () => void;
}

const TUTORIAL_STEPS = [
  {
    title: "Tarjetas de señales",
    description: "Cada tarjeta muestra un activo con su estado actual (COMPRA/VENTA/NEUTRAL) y un nivel de certeza visual.",
    icon: "📊"
  },
  {
    title: "Nivel de certeza",
    description: "Los puntos verdes indican qué tan confiable es la señal. Más puntos = mayor confianza en la predicción.",
    icon: "✓"
  },
  {
    title: "Explora y aprende",
    description: "Toca cualquier activo para ver su gráfico, historial y explicación simple de por qué recibió esa señal.",
    icon: "🔍"
  }
];

export function TutorialSteps({ onComplete, onSkip }: TutorialStepsProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Último paso - completar
      if (typeof window !== "undefined") {
        const w = window as unknown as { gtag?: (cmd: string, evt: string, params: Record<string, string>) => void };
        if (typeof w.gtag === "function") {
          w.gtag("event", "tutorial_completed", {
            event_category: "onboarding",
            event_label: "3_steps"
          });
        }
      }
      onComplete();
    }
  };

  const step = TUTORIAL_STEPS[currentStep];
  const progress = ((currentStep + 1) / TUTORIAL_STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] shadow-2xl">
        {/* Progress bar */}
        <div className="h-1 w-full overflow-hidden rounded-t-2xl bg-[color:var(--muted)]">
          <div
            className="h-full bg-[color:var(--primary)] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-6">
          {/* Icon */}
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--primary)]/10 text-4xl">
              {step.icon}
            </div>
          </div>

          {/* Content */}
          <div className="mb-6 text-center">
            <h2 className="mb-2 text-xl font-bold">{step.title}</h2>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              {step.description}
            </p>
          </div>

          {/* Steps indicator */}
          <div className="mb-6 flex justify-center gap-2">
            {TUTORIAL_STEPS.map((_, idx) => (
              <div
                key={idx}
                className={`h-2 w-2 rounded-full transition-colors ${
                  idx === currentStep
                    ? "bg-[color:var(--primary)]"
                    : idx < currentStep
                    ? "bg-[color:var(--primary)]/50"
                    : "bg-[color:var(--muted)]"
                }`}
              />
            ))}
          </div>

          {/* CTAs */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onSkip}
              className="flex-1 rounded-lg border border-[color:var(--border)] px-4 py-3 font-semibold transition hover:bg-[color:var(--muted)]"
            >
              Saltar
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 rounded-lg bg-[color:var(--primary)] px-4 py-3 font-semibold text-white transition hover:opacity-90"
            >
              {currentStep === TUTORIAL_STEPS.length - 1 ? "Listo" : "Siguiente"}
            </button>
          </div>

          {/* Step counter */}
          <p className="mt-3 text-center text-xs text-[color:var(--muted-foreground)]">
            Paso {currentStep + 1} de {TUTORIAL_STEPS.length}
          </p>
        </div>
      </div>
    </div>
  );
}
