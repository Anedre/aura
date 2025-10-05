"use client";
import { useEffect, useState } from "react";
import { ToastProvider } from "@/app/components/toast/ToastProvider";
import { HealthProvider } from "@/app/components/HealthContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []); // gate de hidratación si usas localStorage
  return (
    <ToastProvider>
      <HealthProvider>
        {ready ? children : null}
      </HealthProvider>
    </ToastProvider>
  );
}
