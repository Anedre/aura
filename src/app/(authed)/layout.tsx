// app/(authed)/layout.tsx

"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import NavShell from "@/app/components/nav/NavShell";
import OnboardingTour from "@/app/components/onboarding/OnboardingTour";
import PostActionCoach from "@/app/components/onboarding/PostActionCoach";
import IntroJourney from "@/app/components/onboarding/IntroJourney";
import ProfileGuideLite from "@/app/components/onboarding/ProfileGuideLite";

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    let alive = true;
    (async () => {
      const sess = await getSession();
      if (!alive) return;
      if (!sess) router.replace(`/?next=${encodeURIComponent(path || "/home")}`);
    })();
    return () => { alive = false; };
  }, [router, path]);

  return (
    <NavShell>
      {children}
      {/* Introductorio: primera vez, minimalista */}
      <IntroJourney />
      {/* Mini-guía específica para /profile */}
      <ProfileGuideLite />
      {/* Coach post-acción (sugerencias didácticas no invasivas) */}
      <PostActionCoach />
      {/* Tour tradicional: desactivado por defecto; se puede reactivar con localStorage */}
      {typeof window !== "undefined" && window.localStorage?.getItem("aura_tour_enabled") === "1" ? (
        <OnboardingTour />
      ) : null}
    </NavShell>
  );
}
