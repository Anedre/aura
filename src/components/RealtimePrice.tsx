"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useRealtimePrice } from "@/hooks/useRealtimePrice";
import { useLivePrice } from "@/hooks/useLivePrice";

const FRESH_THRESHOLD_MS = 15_000;

export function RealtimePrice({ assetId, className }: { assetId: string; className?: string }) {
  const live = useRealtimePrice(assetId);
  const fallback = useLivePrice(assetId);

  const fallbackTsRef = useRef<number | null>(null);
  useEffect(() => {
    if (fallback.price != null && Number.isFinite(fallback.price)) {
      fallbackTsRef.current = Date.now();
    }
  }, [fallback.price]);

  const liveFresh = useMemo(() => {
    if (live.price == null) return false;
    if (live.stale) return false;
    if (!live.ts) return true;
    return Date.now() - live.ts < FRESH_THRESHOLD_MS;
  }, [live.price, live.stale, live.ts]);

  const displayPrice = useMemo(() => {
    if (liveFresh && live.price != null) return live.price;
    if (fallback.price != null) return fallback.price;
    return live.price;
  }, [liveFresh, live.price, fallback.price]);

  const effectiveTs = useMemo(() => {
    if (liveFresh && live.ts) return live.ts;
    if (!liveFresh && fallback.price != null && fallbackTsRef.current != null) return fallbackTsRef.current;
    return live.ts;
  }, [liveFresh, live.ts, fallback.price]);

  const providerLabel = useMemo(() => {
    if (liveFresh && live.provider) {
      return live.symbol ? `${live.provider} - ${live.symbol}` : live.provider;
    }
    if (!liveFresh && fallback.price != null && fallback.provider) {
      return `${fallback.provider} (fallback)`;
    }
    return null;
  }, [liveFresh, live.provider, live.symbol, fallback.price, fallback.provider]);

  const showStale = useMemo(() => {
    if (liveFresh) return false;
    if (fallback.price != null) return false;
    return live.stale;
  }, [liveFresh, fallback.price, live.stale]);

  const ago = useMemo(() => {
    if (!effectiveTs) return "--";
    const delta = Math.max(0, Date.now() - effectiveTs);
    const secs = Math.floor(delta / 1000);
    return `${secs}s`;
  }, [effectiveTs]);

  const pretty = useMemo(() => {
    if (displayPrice == null || !Number.isFinite(displayPrice)) return "--";
    return displayPrice.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }, [displayPrice]);

  const title = useMemo(() => {
    if (liveFresh && (live.symbol || live.provider)) {
      return [live.symbol ?? assetId, live.provider ?? ""].filter(Boolean).join(" - ");
    }
    if (!liveFresh && providerLabel) {
      return `${assetId} - ${providerLabel}`;
    }
    return assetId;
  }, [assetId, liveFresh, live.symbol, live.provider, providerLabel]);

  const statusClass = live.connected
    ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
    : live.connecting
      ? "text-amber-300 bg-amber-500/10 border-amber-500/30"
      : "text-white/60 bg-white/5 border-white/15";

  const statusLabel = live.connected ? "WS:open" : live.connecting ? "WS:connecting" : "WS:idle";

  return (
    <div className={className} title={title}>
      <span className="font-medium mr-2">{assetId}</span>
      <span>{pretty}</span>
      {showStale && (
        <span className="ml-2 text-[10px] px-1 py-0.5 rounded bg-yellow-500/10 text-yellow-300 border border-yellow-500/30">
          STALE
        </span>
      )}
      {providerLabel && (
        <span className="ml-2 text-[11px] px-2 py-0.5 rounded bg-white/5 text-white/70 border border-white/15">
          {providerLabel}
        </span>
      )}
      <span className="ml-2 text-[11px] opacity-70">hace {ago}</span>
      {live.error && <span className="ml-2 text-[11px] text-rose-300">{live.error}</span>}
      {!live.error && (
        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded border ${statusClass}`}>
          {statusLabel}
        </span>
      )}
    </div>
  );
}

export default RealtimePrice;

/*
Usage example:

  <RealtimePrice assetId="BTC-USD" />
  <RealtimePrice assetId="EUR-USD" />
  <RealtimePrice assetId="AAPL" />

*/

