// app/components/onboarding/OnboardingFlow.tsx
"use client";

import { useEffect, useState } from "react";
import { WelcomeTerms } from "./WelcomeTerms";
import { TutorialSteps } from "./TutorialSteps";
import { AppTour } from "./AppTour";

/**
 * OnboardingFlow - Sistema simple de onboarding según HU-A1, HU-A2, HU-A4
 * 
 * 3 fases:
 * 1. Términos y consentimiento (HU-A1)
 * 2. Tutorial 3 pasos skippable (HU-A2)
 * 3. App Tour de 7 coachmarks (HU-A4)
 */

type OnboardingPhase = "terms" | "tutorial" | "tour" | "complete";

export function OnboardingFlow() {
  const [phase, setPhase] = useState<OnboardingPhase | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Verificar si ya completó onboarding
    const completed = localStorage.getItem("aura_onboarding_completed");
    if (completed === "1") {
      setPhase("complete");
      return;
    }

    // Verificar fase actual
    const currentPhase = localStorage.getItem("aura_onboarding_phase") as OnboardingPhase;
    if (currentPhase) {
      setPhase(currentPhase);
    } else {
      // Primera vez - mostrar términos
      setPhase("terms");
      localStorage.setItem("aura_onboarding_phase", "terms");
    }
  }, []);

  const handleTermsAccepted = () => {
    localStorage.setItem("aura_onboarding_phase", "tutorial");
    setPhase("tutorial");
  };

  const handleTutorialComplete = () => {
    localStorage.setItem("aura_onboarding_phase", "tour");
    setPhase("tour");
  };

  const handleTutorialSkipped = () => {
    localStorage.setItem("aura_onboarding_tutorial_skipped", "1");
    localStorage.setItem("aura_onboarding_phase", "tour");
    setPhase("tour");
  };

  const handleTourComplete = () => {
    localStorage.setItem("aura_onboarding_completed", "1");
    localStorage.removeItem("aura_onboarding_phase");
    setPhase("complete");
    
    // Telemetría
    if (typeof window !== "undefined") {
      const w = window as unknown as { gtag?: (cmd: string, evt: string, params: Record<string, string>) => void };
      if (typeof w.gtag === "function") {
        w.gtag("event", "ftue_completed", {
          event_category: "onboarding",
          event_label: "full_flow"
        });
      }
    }
  };

  const handleTourSkipped = () => {
    localStorage.setItem("aura_onboarding_tour_skipped", "1");
    localStorage.setItem("aura_onboarding_completed", "1");
    localStorage.removeItem("aura_onboarding_phase");
    setPhase("complete");
  };

  // No renderizar nada si ya completó
  if (phase === "complete" || phase === null) return null;

  return (
    <>
      {phase === "terms" && (
        <WelcomeTerms onAccept={handleTermsAccepted} />
      )}
      
      {phase === "tutorial" && (
        <TutorialSteps 
          onComplete={handleTutorialComplete}
          onSkip={handleTutorialSkipped}
        />
      )}
      
      {phase === "tour" && (
        <AppTour 
          onComplete={handleTourComplete}
          onSkip={handleTourSkipped}
        />
      )}
    </>
  );
}
