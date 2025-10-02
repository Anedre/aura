"use client";
import { createContext, useContext, useState } from "react";

export type Health = {
  ready: boolean;
  feed: boolean | null;   // true=OK, false=Error, null=desconocido
  paper: boolean | null;
};

type Ctx = {
  health: Health;
  setHealth: (h: Partial<Health>) => void;
};

const HealthContext = createContext<Ctx | null>(null);

export function HealthProvider({ children }: { children: React.ReactNode }) {
  const [health, setHealthState] = useState<Health>({
    ready: false,
    feed: null,
    paper: null,
  });

  function setHealth(patch: Partial<Health>) {
    setHealthState((prev) => ({ ...prev, ...patch }));
  }

  return (
    <HealthContext.Provider value={{ health, setHealth }}>
      {children}
    </HealthContext.Provider>
  );
}

export function useHealth() {
  const ctx = useContext(HealthContext);
  if (!ctx) throw new Error("useHealth debe usarse dentro de <HealthProvider>");
  return ctx;
}
