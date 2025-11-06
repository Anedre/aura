// app/components/onboarding/AppTour.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * AppTour - Tour de 7 coachmarks anclados (HU-A4)
 * 
 * Gherkin:
 * Given estoy en la pantalla correspondiente
 * When avanzo al paso N
 * Then se muestra el coachmark sobre el elemento con data-tour
 */

interface TourStep {
  id: string;
  anchor: string; // data-tour attribute
  screen: string; // ruta donde debe aparecer
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "step-1",
    anchor: "home-feed",
    screen: "/home",
    title: "Feed de señales",
    description: "Aquí verás tarjetas con estado y nivel de certeza para cada activo",
    position: "bottom"
  },
  {
    id: "step-2",
    anchor: "search-input",
    screen: "/feed",
    title: "Buscar activo",
    description: "Busca un activo por nombre o símbolo (ej: BBVA, Telefónica)",
    position: "bottom"
  },
  {
    id: "step-3",
    anchor: "signal-card",
    screen: "/feed",
    title: "Anatomía de tarjeta",
    description: "Esta tarjeta resume precio, cambio y la señal actual con su certeza",
    position: "right"
  },
  {
    id: "step-4",
    anchor: "chart-canvas",
    screen: "/asset/*",
    title: "Gráfico interactivo",
    description: "Explora el gráfico con pan/zoom para ver el historial de precios",
    position: "top"
  },
  {
    id: "step-5",
    anchor: "signal-explanation",
    screen: "/asset/*",
    title: "Explicación ELI5",
    description: "Lee por qué el modelo dio esta señal, explicado en términos simples",
    position: "top"
  },
  {
    id: "step-6",
    anchor: "feed-filters",
    screen: "/feed",
    title: "Filtros",
    description: "Personaliza tu feed con filtros de certeza, tipo de señal y más",
    position: "bottom"
  },
  {
    id: "step-7",
    anchor: "home-feed",
    screen: "/home",
    title: "Explora más",
    description: "Desde aquí puedes navegar a tu perfil, simulador y más herramientas",
    position: "bottom"
  }
];

interface AppTourProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function AppTour({ onComplete, onSkip }: AppTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const pathname = usePathname();

  const step = TOUR_STEPS[currentStep];

  // Verificar si estamos en la pantalla correcta para este paso
  const isCorrectScreen = useCallback(() => {
    if (step.screen.endsWith("*")) {
      const basePath = step.screen.replace("/*", "");
      return pathname?.startsWith(basePath);
    }
    return pathname === step.screen;
  }, [pathname, step.screen]);

  useEffect(() => {
    if (!isCorrectScreen()) return;

    // Buscar el elemento ancla
    const findAnchor = () => {
      const element = document.querySelector(`[data-tour="${step.anchor}"]`);
      if (element) {
        setAnchorRect(element.getBoundingClientRect());
      } else {
        // Reintentar después de un frame
        requestAnimationFrame(findAnchor);
      }
    };

    findAnchor();
  }, [currentStep, pathname, step.anchor, step.screen, isCorrectScreen]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Completar tour
      if (typeof window !== "undefined") {
        const w = window as unknown as { gtag?: (cmd: string, evt: string, params: Record<string, string>) => void };
        if (typeof w.gtag === "function") {
          w.gtag("event", "ftue_completed", {
            event_category: "onboarding",
            event_label: "app_tour"
          });
        }
      }
      onComplete();
    }
  };

  const handleSkip = () => {
    if (typeof window !== "undefined") {
      const w = window as unknown as { gtag?: (cmd: string, evt: string, params: Record<string, string>) => void };
      if (typeof w.gtag === "function") {
        w.gtag("event", "ftue_skipped", {
          event_category: "onboarding",
          event_label: `step_${currentStep + 1}`
        });
      }
    }
    onSkip();
  };

  // No renderizar si no estamos en la pantalla correcta o no hay ancla
  if (!isCorrectScreen() || !anchorRect) return null;

  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  return (
    <>
      {/* Backdrop */}
      <div className="pointer-events-none fixed inset-0 z-[90] bg-black/60" />

      {/* Spotlight - resalta el elemento */}
      <div
        className="pointer-events-none fixed z-[95] rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
        style={{
          top: anchorRect.top - 4,
          left: anchorRect.left - 4,
          width: anchorRect.width + 8,
          height: anchorRect.height + 8
        }}
      />

      {/* Coachmark card */}
      <div
        className="fixed z-[100] w-80 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-4 shadow-2xl"
        style={{
          top: step.position === "bottom" ? anchorRect.bottom + 12 : undefined,
          bottom: step.position === "top" ? window.innerHeight - anchorRect.top + 12 : undefined,
          left: step.position === "right" ? anchorRect.right + 12 : undefined,
          right: step.position === "left" ? window.innerWidth - anchorRect.left + 12 : undefined
        }}
      >
        {/* Progress */}
        <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-[color:var(--muted)]">
          <div
            className="h-full bg-[color:var(--primary)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Content */}
        <h3 className="mb-1 font-semibold">{step.title}</h3>
        <p className="mb-4 text-sm text-[color:var(--muted-foreground)]">
          {step.description}
        </p>

        {/* CTAs */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm text-[color:var(--muted-foreground)] underline hover:text-[color:var(--foreground)]"
          >
            Saltar
          </button>
          <div className="flex gap-2">
            <span className="text-xs text-[color:var(--muted-foreground)]">
              {currentStep + 1}/{TOUR_STEPS.length}
            </span>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              {currentStep === TOUR_STEPS.length - 1 ? "Terminar" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
