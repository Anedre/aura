// app/(authed)/layout.tsx

"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import NavShell from "@/app/components/nav/NavShell";
import { OnboardingFlow } from "@/app/components/onboarding/OnboardingFlow";

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
      <OnboardingFlow />
    </NavShell>
  );
}
