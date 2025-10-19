"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type DirectProvider = "binance" | "finnhub";

export function useDirectRealtime(symbol: string, provider: DirectProvider) {
  const [price, setPrice] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const wsUrl = useMemo(() => {
    if (!symbol || symbol.trim().length === 0) return null;
    if (provider === "binance") {
      let norm = symbol.toLowerCase().replace(/[-/]/g, "");
      if (!/usdt$/.test(norm) && !/busd$/.test(norm)) {
        norm = `${norm}usdt`;
      }
      if (!norm || !/^[a-z0-9]+$/.test(norm)) return null;
      return `wss://stream.binance.com:9443/ws/${norm}@trade`;
    }
    const token = (process.env.NEXT_PUBLIC_FINNHUB_TOKEN ?? process.env.NEXT_PUBLIC_FINNHUB_KEY ?? "").trim();
    if (!token) return null;
    return `wss://ws.finnhub.io?token=${encodeURIComponent(token)}`;
  }, [symbol, provider]);

  useEffect(() => {
    if (!wsUrl) return;
    let alive = true;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    if (provider === "finnhub") {
      ws.onopen = () => {
        try { ws.send(JSON.stringify({ type: "subscribe", symbol })); } catch { /* noop */ }
      };
    }

    ws.onmessage = (ev) => {
      try {
        if (provider === "binance") {
          const j = JSON.parse(ev.data as string) as { p?: string };
          if (j && j.p != null) {
            const v = Number.parseFloat(j.p);
            if (alive && Number.isFinite(v)) setPrice(v);
          }
        } else {
          const j = JSON.parse(ev.data as string) as { data?: Array<{ p: number }> };
          const v = j?.data?.[0]?.p;
          if (alive && typeof v === "number" && Number.isFinite(v)) setPrice(v);
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      alive = false;
      try {
        if (provider === "finnhub") ws.send(JSON.stringify({ type: "unsubscribe", symbol }));
      } catch { /* noop */ }
      ws.close();
    };
  }, [wsUrl, provider, symbol]);

  return { price } as const;
}
