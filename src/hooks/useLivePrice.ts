"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuraStream, type Provider as StreamProvider } from "@/hooks/useAuraStream";
import { useLiveMarket } from "@/hooks/useLiveMarket";
import { classifySymbol } from "@/lib/market";
import { useDirectRealtime } from "@/hooks/useDirectRealtime";

export function pickProvider(symbol: string): StreamProvider {
  const s = symbol.toUpperCase();
  if (/USDT$/.test(s) || /-USDT$/.test(s) || /-USD$/.test(s)) return "binance"; // cripto
  if (/=X$/.test(s) || /^[A-Z]{1,5}$/.test(s) || /^\^/.test(s)) return "finnhub"; // forex/equity/index
  return "yahoo";
}

export function useLivePrice(symbol: string, provider?: StreamProvider) {
  const prov = provider ?? pickProvider(symbol);
  const { subscribe, unsubscribe, ticks } = useAuraStream();
  const [wsPrice, setWsPrice] = useState<number | null>(null);
  const key = `${prov}|${symbol}`;

  // WS (agregador) si existe
  useEffect(() => {
    subscribe(symbol, prov);
    const id = window.setInterval(() => {
      const arr = (ticks as Record<string, { price: number }[]>)[key] ?? [];
      const last = arr.length ? arr[arr.length - 1].price : null;
      setWsPrice(last != null && Number.isFinite(last) ? last : null);
    }, 800);
    return () => { window.clearInterval(id); unsubscribe(symbol, prov); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, prov]);

  // Direct WS (se invoca siempre para no violar reglas de hooks)
  const klass = classifySymbol(symbol);
  const binanceSym = useMemo(() => symbol.replace(/[-/]/g, ""), [symbol]);
  const directBinance = useDirectRealtime(binanceSym, "binance");
  const directFinnhub = useDirectRealtime(symbol, "finnhub");
  const directPrice = useMemo(() => (
    (prov === "binance" || klass === "crypto") ? directBinance.price : (prov === "finnhub" ? directFinnhub.price : null)
  ), [prov, klass, directBinance.price, directFinnhub.price]);

  // Polling ligero (histórico: Yahoo/Binance)
  const marketProvider: 'yahoo' | 'binance' = prov === 'binance' ? 'binance' : 'yahoo';
  const { lastPrice } = useLiveMarket({ symbol, tf: "5m", provider: marketProvider, refreshMs: 5_000 });

  const price = useMemo(() => wsPrice ?? directPrice ?? lastPrice ?? null, [wsPrice, directPrice, lastPrice]);
  return { price, provider: prov } as const;
}
