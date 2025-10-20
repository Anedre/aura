"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Candle as MarketCandle, Timeframe as MarketTf } from "@/lib/market";
import { tfMs, bucketStart } from '@/lib/market';
import { auraWs, type Tick as WsTick, type AckEvent } from "@/lib/aura-ws";

export type Provider = "binance" | "finnhub" | "yahoo";
type WsStatus = "idle" | "connecting" | "open" | "closing" | "closed" | "error";

export type Tick = {
  type: "tick";
  provider: Provider;
  symbol: string;
  price: number;
  ts: number;
  iso?: string;
};

export function useAuraStream() {
  const [status, setStatus] = useState<WsStatus>("idle");
  const [lastAck, setLastAck] = useState<{ type: "ack" | "ack_unsub"; provider: Provider; symbol: string; message: string; timestamp: string } | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [ticks, setTicks] = useState<Record<string, Tick[]>>({});
  const subsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    void auraWs.connect();
    const onOpen = () => { if (mounted) setStatus("open"); };
    const onClose = () => { if (mounted) setStatus("closed"); };
    const onErr = (m: string) => { if (mounted) { setStatus("error"); setLastError(m || "error"); } };
    const onAck = (ack: AckEvent) => {
      if (!mounted) return;
      const m = (ack as unknown as Record<string, unknown>).message;
      const t = (ack as unknown as Record<string, unknown>).timestamp;
      setLastAck({
        type: ack.type,
        provider: (ack.provider as Provider),
        symbol: ack.symbol,
        message: typeof m === "string" ? m : "",
        timestamp: typeof t === "string" ? t : new Date().toISOString(),
      });
    };
    const onTicks = (arr: WsTick[]) => {
      if (!mounted) return;
      setTicks(prev => {
        const next = { ...prev };
        for (const t of arr) {
          const key = `${t.provider}|${t.symbol}`;
          const a = next[key] ?? [];
          a.push({ type: "tick", provider: t.provider as Provider, symbol: t.symbol, price: t.price, ts: t.ts, iso: t.iso });
          if (a.length > 5000) a.splice(0, a.length - 5000);
          next[key] = a;
        }
        return next;
      });
    };

    auraWs.on("open", onOpen);
    auraWs.on("close", onClose);
    auraWs.on("error", onErr);
    auraWs.on("errorMsg", onErr);
    auraWs.on("ack", onAck);
    auraWs.on("ticks", onTicks);

    const rs = auraWs.readyState;
    if (rs === WebSocket.OPEN) setStatus("open");
    else if (rs === WebSocket.CONNECTING) setStatus("connecting");
    else setStatus("idle");

    return () => {
      mounted = false;
      auraWs.off("open", onOpen);
      auraWs.off("close", onClose);
      auraWs.off("error", onErr);
      auraWs.off("errorMsg", onErr);
      auraWs.off("ack", onAck);
      auraWs.off("ticks", onTicks);
      // No cerramos el socket para mantener singleton compartido
    };
  }, []);

  const subscribe = useCallback((symbol: string, provider: Provider) => {
    const s = (symbol ?? "").trim();
    if (!s) return false;
    const key = `${provider}|${s}`;
    subsRef.current.add(key);
    auraWs.subscribeSymbol(s, provider);
    return true;
  }, []);

  const unsubscribe = useCallback((symbol: string, provider: Provider) => {
    const s = (symbol ?? "").trim();
    if (!s) return false;
    const key = `${provider}|${s}`;
    subsRef.current.delete(key);
    auraWs.unsubscribeSymbol(s, provider);
    return true;
  }, []);

  // Subscribe/unsubscribe by assetId using server-side router (auto provider)
  const subscribeAsset = useCallback((assetId: string) => {
    const id = (assetId ?? "").trim();
    if (!id) return false;
    // Track synthetic key to reuse existing storage: mark with provider 'auto'
    const key = `auto|${id}`;
    subsRef.current.add(key);
    auraWs.subscribe(id); // auto-route on server
    return true;
  }, []);

  const unsubscribeAsset = useCallback((assetId: string) => {
    const id = (assetId ?? "").trim();
    if (!id) return false;
    const key = `auto|${id}`;
    subsRef.current.delete(key);
    auraWs.unsubscribe(id);
    return true;
  }, []);

  const buildCandles = useCallback((key: string, tf: MarketTf): MarketCandle[] => {
    const size = tfMs[tf];
    const arr = ticks[key] || [];
    const by = new Map<number, MarketCandle>();
    for (const t of arr) {
      const b = bucketStart(t.ts, tf);
      const c = by.get(b);
      if (!c) by.set(b, { t: b, o: t.price, h: t.price, l: t.price, c: t.price, v: 0, fin: false });
      else { c.h = Math.max(c.h, t.price); c.l = Math.min(c.l, t.price); c.c = t.price; }
    }
    const out = Array.from(by.values()).sort((a, b) => a.t - b.t);
    const now = Date.now();
    for (const k of out) k.fin = (now - k.t) > size;
    return out;
  }, [ticks]);

  return { status: lastError ? "error" : status, lastAck, lastError, ticks, buildCandles, subscribe, unsubscribe, subscribeAsset, unsubscribeAsset, sendJson: () => false } as const;
}
