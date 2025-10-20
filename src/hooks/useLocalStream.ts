"use client";

import { useEffect, useState } from "react";
import { localStream, type LocalTick } from "@/lib/local-stream";
import { tfMs, bucketStart } from "@/lib/market";

export function useLocalStream() {
  const [status, setStatus] = useState(localStream.status);
  const [lastError, setLastError] = useState<string | null>(localStream.lastError);
  const [ticks, setTicks] = useState<Record<string, LocalTick[]>>({ ...localStream.ticks });

  useEffect(() => {
    const onOpen = () => setStatus("open");
    const onClose = () => setStatus("closed");
    const onErr = (m: string) => { setStatus("error"); setLastError(m); };
    const onTicks = () => {
      setTicks({ ...localStream.ticks });
      if (localStream.status !== "open") setStatus("open");
    };
    localStream.on("open", onOpen);
    localStream.on("close", onClose);
    localStream.on("error", onErr);
    localStream.on("ticks", onTicks);
    return () => {
      localStream.off("open", onOpen);
      localStream.off("close", onClose);
      localStream.off("error", onErr);
      localStream.off("ticks", onTicks);
    };
  }, []);

  const buildCandles = (key: string, tf: keyof typeof tfMs) => {
    const arr = ticks[key] ?? [];
    const by = new Map<number, { t: number; o: number; h: number; l: number; c: number; v: number }>();
    for (const t of arr) {
      const b = bucketStart(t.ts, tf);
      const c = by.get(b);
      if (!c) by.set(b, { t: b, o: t.price, h: t.price, l: t.price, c: t.price, v: 0 });
      else { c.h = Math.max(c.h, t.price); c.l = Math.min(c.l, t.price); c.c = t.price; }
    }
    return Array.from(by.values()).sort((a, b) => a.t - b.t);
  };

  return {
    status,
    lastError,
    ticks,
    subscribeAsset: (assetId: string) => localStream.subscribeAsset(assetId),
    unsubscribeAsset: (assetId: string) => localStream.unsubscribeAsset(assetId),
    buildCandles,
  } as const;
}
