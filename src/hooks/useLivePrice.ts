"use client";

import { useEffect, useMemo, useState } from "react";
import type { Provider as StreamProvider } from "@/hooks/useAuraStream";
import { useLiveMarket } from "@/hooks/useLiveMarket";
import { classifySymbol, mapSymbol } from "@/lib/market";
import { useDirectRealtime } from "@/hooks/useDirectRealtime";

export function pickProvider(symbol: string): StreamProvider {
  const s = symbol.toUpperCase();
  if (/USDT$/.test(s) || /-USDT$/.test(s) || /-USD$/.test(s)) return "binance"; // cripto
  if (/=X$/.test(s) || /^[A-Z]{1,5}$/.test(s) || /^\^/.test(s)) return "finnhub"; // forex/equity/index
  return "yahoo";
}

export function useLivePrice(symbol: string, provider?: StreamProvider) {
  const prov = provider ?? pickProvider(symbol);
  // WS backend deshabilitado en modo local
  const [wsPrice] = useState<number | null>(null);
  const subSymbol = useMemo(() => (prov === 'binance' ? mapSymbol('binance', symbol) : symbol), [prov, symbol]);
  // const key = `${prov}|${subSymbol}`; // reservado para futuro uso

  // WS (agregador) si existe
  useEffect(() => {
    // no-op: reservamos el efecto para no romper reglas de hooks
  }, [subSymbol, prov]);

  // Direct WS (se invoca siempre para no violar reglas de hooks)
  const klass = classifySymbol(symbol);
  const binanceSym = useMemo(() => mapSymbol('binance', symbol), [symbol]);
  const directBinance = useDirectRealtime(binanceSym, "binance");
  const directFinnhub = useDirectRealtime(symbol, "finnhub");
  const directPrice = useMemo(() => (
    (prov === "binance" || klass === "crypto") ? directBinance.price : (prov === "finnhub" ? directFinnhub.price : null)
  ), [prov, klass, directBinance.price, directFinnhub.price]);

  // Polling ligero (histórico: Yahoo/Binance)
  // Modo local: usar Yahoo también para el polling de precio
  const { lastPrice } = useLiveMarket({ symbol, tf: "5m", provider: 'yahoo', refreshMs: 5_000 });

  const price = useMemo(() => wsPrice ?? directPrice ?? lastPrice ?? null, [wsPrice, directPrice, lastPrice]);
  return { price, provider: prov } as const;
}
