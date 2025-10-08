"use client";
import { useEffect, useState } from "react";

export function useCadence(ms: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(ms) || ms <= 0) return;
    const id = setInterval(() => setTick((t) => (t + 1) & 0x3fffffff), ms);
    return () => clearInterval(id);
  }, [ms]);
  return tick; // cambia solo a la cadencia solicitada
}
