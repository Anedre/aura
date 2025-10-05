// app/providers.tsx
"use client";

import { useEffect, useState } from "react";
import { ToastProvider } from "@/app/components/toast/ToastProvider";
import { HealthProvider } from "@/app/components/HealthContext";
import { setupAmplify } from "@/lib/amplify-config";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setupAmplify(); setReady(true); }, []);
  return (
    <ToastProvider>
      <HealthProvider>
        {ready ? children : null}
      </HealthProvider>
    </ToastProvider>
  );
}
