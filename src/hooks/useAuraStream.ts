"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Candle as MarketCandle, Timeframe as MarketTf } from "@/lib/market";
import { tfMs, bucketStart } from '@/lib/market';

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

type TicksEnvelope = { type: "ticks"; data: Tick[] };
type Ack = { type: "ack" | "ack_unsub"; provider: Provider; symbol: string; message: string; timestamp: string };
type Err = { type: "error"; message: string };

// JSON “seguro” para evitar any
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [k: string]: JsonValue };


export function useAuraStream(wsUrl = process.env.NEXT_PUBLIC_WS_URL as string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<WsStatus>("idle");
  const [lastAck, setLastAck] = useState<Ack | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [ticks, setTicks] = useState<Record<string, Tick[]>>({});

  // reconexión con backoff
  const triesRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!wsUrl) { setLastError("WS URL no configurada"); return; }

    setStatus("connecting");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => { setStatus("open"); triesRef.current = 0; };

    ws.onclose = () => {
      setStatus("closed");
      const t = triesRef.current;
      if (t < 5) {
        const delay = Math.min(1000 * Math.pow(2, t), 10_000);
        triesRef.current = t + 1;
        timerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => { setStatus("error"); setLastError("WebSocket error"); };

    ws.onmessage = (ev: MessageEvent) => {
      try {
        const raw = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);
        const msg = JSON.parse(raw) as unknown;

        if (typeof msg !== "object" || msg === null) return;
        const type = (msg as { type?: string }).type;

        if (type === "ticks" && Array.isArray((msg as TicksEnvelope).data)) {
          const batch = msg as TicksEnvelope;
          setTicks(prev => {
            const next = { ...prev };
            for (const t of batch.data) {
              const key = `${t.provider}|${t.symbol}`;
              const arr = next[key] ?? [];
              arr.push(t);
              if (arr.length > 5000) arr.splice(0, arr.length - 5000);
              next[key] = arr;
            }
            return next;
          });
        } else if (type === "ack" || type === "ack_unsub") {
          setLastAck(msg as Ack);
        } else if (type === "error") {
          setLastError((msg as Err).message ?? "error");
        }
      } catch {
        // ignore parse errors
      }
    };
  }, [wsUrl]);

  useEffect(() => {
    connect();
    // captura refs locales para cleanup estable (sin advertencias)
    const wsOnMount = wsRef.current;
    const timerOnMount = timerRef.current;
    return () => {
      if (timerOnMount) clearTimeout(timerOnMount);
      if (wsOnMount && (wsOnMount.readyState === WebSocket.OPEN || wsOnMount.readyState === WebSocket.CONNECTING)) {
        setStatus("closing");
        wsOnMount.close();
      }
    };
  }, [connect]);

  const sendJson = useCallback(<T extends Record<string, JsonValue>>(obj: T): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(obj));
    return true;
  }, []);

  const subscribe = useCallback((symbol: string, provider: Provider) => sendJson({ action: "subscribe", symbol, provider }), [sendJson]);
  const unsubscribe = useCallback((symbol: string, provider: Provider) => sendJson({ action: "unsubscribe", symbol, provider }), [sendJson]);

   const buildCandles = useCallback((key: string, tf: MarketTf): MarketCandle[] => {
    const size = tfMs[tf];
    const arr = ticks[key] || [];
    const by = new Map<number, MarketCandle>();
    for (const t of arr) {
      // bucketStart oficial usa Timeframe, no ms:
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

  return { status: lastError ? "error" : status, lastAck, lastError, ticks, buildCandles, subscribe, unsubscribe, sendJson };
}
