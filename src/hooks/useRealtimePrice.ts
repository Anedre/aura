"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { auraWs } from "@/lib/aura-ws";

export type RealtimeState = {
  price: number | null;
  ts: number | null;
  stale: boolean;
  provider: "binance" | "finnhub" | "yahoo" | null;
  symbol: string | null;
  connecting: boolean;
  connected: boolean;
  error: string | null;
};

type SP = string; // `${symbol}#${provider}`

// Module-local caches for dedupe and ref-counting
const lastBySp = new Map<SP, { price: number; ts: number; stale?: boolean }>();
const assetToSp = new Map<string, SP>();
const subscribers = new Map<string, number>(); // assetId -> count

function spOf(p: { symbol: string; provider: string }): SP {
  return `${p.symbol}#${p.provider}`.toLowerCase();
}

export function useRealtimePrice(assetId: string): RealtimeState {
  const id = (assetId ?? "").trim();
  const [state, setState] = useState<RealtimeState>({
    price: null,
    ts: null,
    stale: false,
    provider: null,
    symbol: null,
    connecting: false,
    connected: false,
    error: null,
  });

  const mountedRef = useRef(false);

  const missingUrl = useMemo(() => !(process.env.NEXT_PUBLIC_WS_URL ?? "").trim(), []);

  useEffect(() => {
    if (!id) return;
    mountedRef.current = true;

    if (missingUrl) {
      setState((s) => ({ ...s, connecting: false, connected: false, error: "WS URL missing" }));
      return () => { mountedRef.current = false; };
    }

    // Connect once
    void auraWs.connect();

    // Subscribe with ref counting
    const prev = subscribers.get(id) ?? 0;
    subscribers.set(id, prev + 1);
    auraWs.subscribe(id);

    const onOpen = () => {
      if (!mountedRef.current) return;
      setState((s) => ({ ...s, connecting: false, connected: true, error: null }));
    };
    const onClose = () => {
      if (!mountedRef.current) return;
      setState((s) => ({ ...s, connecting: false, connected: false }));
    };
    const onErr = (m: string) => {
      if (!mountedRef.current) return;
      setState((s) => ({ ...s, error: m, connecting: false }));
    };
    const onAck = (ack: { provider: string; symbol: string; type: string }) => {
      // Track mapping assetId -> sp for quick lookups when ticks arrive
      const sp = spOf({ provider: ack.provider, symbol: ack.symbol });
      assetToSp.set(id, sp);
    };
    const onTicks = (arr: Array<{ provider: "binance" | "finnhub" | "yahoo"; symbol: string; price: number; ts: number; stale?: boolean }>) => {
      if (!mountedRef.current) return;
      // Only update for ticks matching this asset
      const sp = assetToSp.get(id);
      let chosen: { provider: "binance" | "finnhub" | "yahoo"; symbol: string; price: number; ts: number; stale?: boolean } | null = null;
      for (const t of arr) {
        const k = spOf({ provider: t.provider, symbol: t.symbol });
        if (!sp || k === sp) {
          chosen = t; // last matching tick wins (they arrive batched)
          // cache for dedupe across hook instances
          const last = lastBySp.get(k);
          if (!last || last.price !== t.price || last.ts !== t.ts || !!last.stale !== !!t.stale) {
            lastBySp.set(k, { price: t.price, ts: t.ts, stale: t.stale });
          }
        }
      }
      if (!chosen) return;
      const spKey = spOf({ provider: chosen.provider, symbol: chosen.symbol });
      const prev = lastBySp.get(spKey);
      if (prev && prev.price === chosen.price && prev.ts === chosen.ts && !!prev.stale === !!chosen.stale) return;
      lastBySp.set(spKey, { price: chosen.price, ts: chosen.ts, stale: chosen.stale });
      setState({
        price: chosen.price,
        ts: chosen.ts,
        stale: !!chosen.stale,
        provider: chosen.provider,
        symbol: chosen.symbol,
        connecting: auraWs.readyState === WebSocket.CONNECTING,
        connected: auraWs.readyState === WebSocket.OPEN,
        error: null,
      });
    };

    auraWs.on("open", onOpen);
    auraWs.on("close", onClose);
    auraWs.on("error", onErr);
    auraWs.on("errorMsg", onErr);
    auraWs.on("ack", onAck);
    auraWs.on("ticks", onTicks);

    // Initial connecting state
    setState((s) => ({ ...s, connecting: auraWs.readyState === WebSocket.CONNECTING, connected: auraWs.readyState === WebSocket.OPEN }));

    return () => {
      mountedRef.current = false;
      auraWs.off("open", onOpen);
      auraWs.off("close", onClose);
      auraWs.off("error", onErr);
      auraWs.off("errorMsg", onErr);
      auraWs.off("ack", onAck);
      auraWs.off("ticks", onTicks);

      const count = (subscribers.get(id) ?? 1) - 1;
      if (count <= 0) {
        subscribers.delete(id);
        auraWs.unsubscribe(id);
        // Optional: cleanup caches
        const sp = assetToSp.get(id);
        if (sp) assetToSp.delete(id);
      } else {
        subscribers.set(id, count);
      }
    };
  }, [id, missingUrl]);

  return state;
}

