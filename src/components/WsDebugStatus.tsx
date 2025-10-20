"use client";

import React, { useMemo } from "react";
import { useAuraStream } from "@/hooks/useAuraStream";

export default function WsDebugStatus() {
  const aura = useAuraStream();

  const last = useMemo(() => {
    let best: { key: string; price: number; ts: number; iso?: string } | null = null;
    for (const [key, arr] of Object.entries(aura.ticks)) {
      if (!Array.isArray(arr) || arr.length === 0) continue;
      const t = arr[arr.length - 1];
      if (!t || typeof t.ts !== "number") continue;
      if (!best || t.ts > best.ts) best = { key, price: t.price, ts: t.ts, iso: t.iso };
    }
    return best;
  }, [aura.ticks]);

  const badge = (
    <span
      className={`px-2 py-0.5 rounded border text-[11px] ${
        aura.status === "open"
          ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
          : aura.status === "connecting"
            ? "text-amber-300 bg-amber-500/10 border-amber-500/30"
            : aura.status === "error"
              ? "text-rose-300 bg-rose-500/10 border-rose-500/30"
              : "text-white/70 bg-white/5 border-white/15"
      }`}
      title="WebSocket status"
    >
      WS: {aura.status}
    </span>
  );

  return (
    <div className="text-xs flex items-center gap-3">
      {badge}
      {aura.lastError && <span className="text-rose-300">{aura.lastError}</span>}
      {aura.lastAck && (
        <span className="opacity-80" title={`Ack ${aura.lastAck.provider} ${aura.lastAck.symbol}`}>
          ack: {aura.lastAck.provider}/{aura.lastAck.symbol}
        </span>
      )}
      {last && (
        <span className="opacity-80" title={last.iso ?? ""}>
          last: {last.key} @ {last.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}
        </span>
      )}
      <span className="opacity-60">streams: {Object.keys(aura.ticks).length}</span>
    </div>
  );
}

