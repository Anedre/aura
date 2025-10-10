"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuraStream, type Provider as StreamProvider } from "@/hooks/useAuraStream";
import { useLiveMarket } from "@/hooks/useLiveMarket";

export function pickProvider(symbol: string): StreamProvider {
  const s = symbol.toUpperCase();
  // Binance sólo si el símbolo ya viene en formato sin guión y termina en USDT (p.ej., BTCUSDT)
  if (/USDT$/.test(s) && !s.includes("-")) return "binance";
  // Todo lo demás (BTC-USD, AAPL, SPY, EURUSD=X, etc.) → Yahoo
  return "yahoo";
}

export function useLivePrice(symbol: string, provider?: StreamProvider) {
  const prov = provider ?? pickProvider(symbol);
  const { subscribe, unsubscribe, ticks } = useAuraStream();
  const [wsPrice, setWsPrice] = useState<number | null>(null);
  const key = `${prov}|${symbol}`;

  // WS suscripción + lectura periódica de último tick
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

  // Fallback por polling ligero (si no hay WS)
  // useLiveMarket solo acepta 'yahoo' | 'binance' | 'auto'; mapeamos 'finnhub' -> 'yahoo'
  const marketProvider: 'yahoo' | 'binance' = prov === 'binance' ? 'binance' : 'yahoo';
  const { lastPrice } = useLiveMarket({ symbol, tf: "5m", provider: marketProvider, refreshMs: 5_000 });

  const price = useMemo(() => wsPrice ?? lastPrice ?? null, [wsPrice, lastPrice]);
  return { price, provider: prov } as const;
}
