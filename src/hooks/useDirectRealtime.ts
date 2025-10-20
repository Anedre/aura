"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type DirectProvider = "binance" | "finnhub";

const BINANCE_WS_ROOT = "wss://stream.binance.com:9443/ws";

export function useDirectRealtime(symbol: string, provider: DirectProvider) {
  const [price, setPrice] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const wsUrl = useMemo(() => {
    const trimmed = (symbol ?? "").trim();
    if (!trimmed) return null;
    if (provider === "binance") {
      const flag = (process.env.NEXT_PUBLIC_ENABLE_DIRECT_BINANCE_WS ?? "").trim().toLowerCase();
      const disabled = flag === "0" || flag === "false" || flag === "no" || flag === "off";
      if (disabled) return null;

      // Normaliza: BTC-USD | BTCUSDT | btcusd -> btcusdt
      let norm = trimmed.toLowerCase().replace(/[-/]/g, "");
      // Si termina en usd puro, convertirlo a usdt; evita duplicar sufijo
      if (/usd$/.test(norm) && !/usdt$/.test(norm)) {
        norm = norm.replace(/usd$/, "usdt");
      }
      // Si no termina en usdt o busd, asumimos usdt
      if (!/(usdt|busd)$/.test(norm)) {
        norm = `${norm}usdt`;
      }
      if (!norm || !/^[a-z0-9]+$/.test(norm)) return null;
      return `${BINANCE_WS_ROOT}/${norm}@trade`;
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
        try {
          ws.send(JSON.stringify({ type: "subscribe", symbol }));
        } catch {
          /* ignore */
        }
      };
    }

    ws.onmessage = (ev) => {
      try {
        if (provider === "binance") {
          const payload = JSON.parse(typeof ev.data === "string" ? ev.data : "") as { p?: string };
          const value = payload?.p != null ? Number.parseFloat(payload.p) : Number.NaN;
          if (alive && Number.isFinite(value)) setPrice(value);
        } else {
          const payload = JSON.parse(typeof ev.data === "string" ? ev.data : "") as { data?: Array<{ p?: number }> };
          const value = payload?.data?.[0]?.p;
          if (alive && typeof value === "number" && Number.isFinite(value)) setPrice(value);
        }
      } catch {
        /* ignore */
      }
    };

    return () => {
      alive = false;
      if (provider === "finnhub") {
        try {
          ws.send(JSON.stringify({ type: "unsubscribe", symbol }));
        } catch {
          /* ignore */
        }
      }
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [symbol, provider, wsUrl]);

  return { price } as const;
}
