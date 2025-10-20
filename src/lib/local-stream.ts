"use client";

import { tfMs, bucketStart } from "@/lib/market";

export type LocalProvider = "binance" | "finnhub" | "yahoo";

export type LocalTick = {
  provider: LocalProvider;
  symbol: string;
  price: number;
  ts: number;
  iso?: string;
  stale?: boolean;
};

type EventMap = {
  open: void;
  close: void;
  error: string;
  ack: { provider: LocalProvider; symbol: string };
  ticks: LocalTick[];
};

type Listener<K extends keyof EventMap> = (payload: EventMap[K]) => void;

function nowIso(): string { return new Date().toISOString(); }

function mapCryptoSymbolBinance(assetId: string): string {
  // BTC-USD, BTCUSDT, BTC/USD → BTCUSDT
  const s = assetId.replace("/", "-").toUpperCase();
  if (s.includes("-")) {
    const [base, quote] = s.split("-");
    const q = quote === "USD" ? "USDT" : quote;
    return `${base}${q}`;
  }
  if (!/USDT$/.test(s) && !/USD$/.test(s)) return `${s}USDT`;
  if (/USD$/.test(s) && !/USDT$/.test(s)) return s.replace(/USD$/, "USDT");
  return s;
}

function mapFxSymbolFinnhub(assetId: string): string {
  // EUR-USD → OANDA:EUR_USD, EURUSD → OANDA:EUR_USD
  const s = assetId.replace("/", "-").toUpperCase();
  const parts = s.includes("-") ? s.split("-") : [s.slice(0, 3), s.slice(3)];
  if (parts.length === 2 && parts[0].length === 3 && parts[1].length === 3) {
    return `OANDA:${parts[0]}_${parts[1]}`;
  }
  return `OANDA:${s.slice(0, 3)}_${s.slice(3, 6)}`;
}

function mapEquityYahoo(assetId: string): string { return assetId.replace("/", "-").toUpperCase(); }

function key(provider: LocalProvider, symbol: string): string { return `${provider}|${symbol}`; }

class LocalStream {
  status: "idle" | "connecting" | "open" | "closing" | "closed" | "error" = "idle";
  lastError: string | null = null;
  ticks: Record<string, LocalTick[]> = {};
  private listeners: { [K in keyof EventMap]: Set<Listener<K>> } = {
    open: new Set(), close: new Set(), error: new Set(), ack: new Set(), ticks: new Set(),
  };

  // Binance: one ws per symbol for simplicity
  private binance: Map<string, WebSocket> = new Map();
  private binanceRef: Map<string, number> = new Map();

  // Finnhub: single ws with multiple subs
  private finnhub: WebSocket | null = null;
  private finnhubSubs: Set<string> = new Set();
  private finnhubConnected = false;

  // Yahoo: polling per symbol
  private yahooTimers: Map<string, number> = new Map();
  private yahooRef: Map<string, number> = new Map();

  on<K extends keyof EventMap>(ev: K, cb: Listener<K>): void { this.listeners[ev].add(cb as never); }
  off<K extends keyof EventMap>(ev: K, cb: Listener<K>): void { this.listeners[ev].delete(cb as never); }
  private emit<K extends keyof EventMap>(ev: K, payload: EventMap[K]): void {
    for (const cb of this.listeners[ev]) {
      try {
        const fn = cb as (p: EventMap[K]) => void;
        fn(payload);
      } catch {
        /* noop */
      }
    }
  }

  private pushTick(t: LocalTick): void {
    const kKey = key(t.provider, t.symbol);
    const arr = this.ticks[kKey] ?? [];
    arr.push(t);
    if (arr.length > 5000) arr.splice(0, arr.length - 5000);
    this.ticks[kKey] = arr;
    this.emit("ticks", [t]);
  }

  // Public API
  subscribeAsset(assetId: string): boolean {
    const id = (assetId ?? "").trim();
    if (!id) return false;
    const upper = id.toUpperCase();
    // Determine provider
    let provider: LocalProvider = "yahoo";
    if (/^([A-Z]{3})[-/ ]?([A-Z]{3})$/.test(upper)) provider = "finnhub"; // FX
    if (/^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|TRX|MATIC|DOT|AVAX|SHIB|LTC|UNI|LINK|NEAR|ATOM|ETC|OP|ARB|TON|BCH|APT|FIL|ALGO|AAVE|SUI|SEI|PEPE)(?:[-/ ]?(USD|USDT))?$/.test(upper)) provider = "binance";

    if (provider === "binance") {
      const sym = mapCryptoSymbolBinance(upper);
      const ref = this.binanceRef.get(sym) ?? 0;
      this.binanceRef.set(sym, ref + 1);
      if (!this.binance.has(sym)) this.openBinance(sym);
      this.emit("ack", { provider: "binance", symbol: sym });
      return true;
    }
    if (provider === "finnhub") {
      const sym = mapFxSymbolFinnhub(upper);
      this.finnhubSubs.add(sym);
      this.openFinnhub();
      // defer subscribe until open
      this.emit("ack", { provider: "finnhub", symbol: sym });
      return true;
    }
    // yahoo
    const sym = mapEquityYahoo(upper);
    const ref = this.yahooRef.get(sym) ?? 0;
    this.yahooRef.set(sym, ref + 1);
    if (!this.yahooTimers.has(sym)) this.startYahoo(sym);
    this.emit("ack", { provider: "yahoo", symbol: sym });
    return true;
  }

  unsubscribeAsset(assetId: string): boolean {
    const id = (assetId ?? "").trim();
    if (!id) return false;
    const upper = id.toUpperCase();
    if (/^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|TRX|MATIC|DOT|AVAX|SHIB|LTC|UNI|LINK|NEAR|ATOM|ETC|OP|ARB|TON|BCH|APT|FIL|ALGO|AAVE|SUI|SEI|PEPE)/.test(upper)) {
      const sym = mapCryptoSymbolBinance(upper);
      const left = (this.binanceRef.get(sym) ?? 1) - 1;
      if (left <= 0) {
        this.binanceRef.delete(sym);
        this.closeBinance(sym);
      } else this.binanceRef.set(sym, left);
      return true;
    }
    if (/^([A-Z]{3})[-/ ]?([A-Z]{3})$/.test(upper)) {
      const sym = mapFxSymbolFinnhub(upper);
      this.sendFinnhub({ type: "unsubscribe", symbol: sym });
      this.finnhubSubs.delete(sym);
      return true;
    }
    const sym = mapEquityYahoo(upper);
    const left = (this.yahooRef.get(sym) ?? 1) - 1;
    if (left <= 0) {
      this.yahooRef.delete(sym);
      const t = this.yahooTimers.get(sym);
      if (t) { clearInterval(t); this.yahooTimers.delete(sym); }
    } else this.yahooRef.set(sym, left);
    return true;
  }

  buildCandles(spKey: string, tf: keyof typeof tfMs) {
    const arr = this.ticks[spKey] ?? [];
    const by = new Map<number, { t: number; o: number; h: number; l: number; c: number; v: number }>();
    for (const t of arr) {
      const b = bucketStart(t.ts, tf);
      const c = by.get(b);
      if (!c) by.set(b, { t: b, o: t.price, h: t.price, l: t.price, c: t.price, v: 0 });
      else { c.h = Math.max(c.h, t.price); c.l = Math.min(c.l, t.price); c.c = t.price; }
    }
    return Array.from(by.values()).sort((a, b) => a.t - b.t);
  }

  // ---- Binance ----
  private openBinance(sym: string) {
    const stream = `${sym.toLowerCase()}@trade`;
    try {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
      this.binance.set(sym, ws);
      this.status = "connecting";
      ws.onopen = () => { this.status = "open"; this.emit("open", undefined as unknown as void); };
      ws.onerror = () => { this.status = "error"; this.lastError = "binance ws error"; this.emit("error", this.lastError); };
      ws.onclose = () => { this.binance.delete(sym); this.emit("close", undefined as unknown as void); };
      ws.onmessage = (ev: MessageEvent) => {
        const raw = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);
        try {
          const j = JSON.parse(raw) as Record<string, unknown>;
          const payload = (j["data"] as Record<string, unknown>) ?? j;
          const p = Number((payload["p"] as string) ?? (payload["price"] as string));
          const ts = Number((payload["T"] as number) ?? (payload["E"] as number) ?? Date.now());
          if (Number.isFinite(p) && Number.isFinite(ts)) this.pushTick({ provider: "binance", symbol: sym, price: p, ts, iso: nowIso() });
        } catch {
          /* noop */
        }
      };
    } catch (e) {
      this.status = "error"; this.lastError = e instanceof Error ? e.message : String(e); this.emit("error", this.lastError);
    }
  }
  private closeBinance(sym: string) { try { this.binance.get(sym)?.close(); } catch { /* noop */ } finally { this.binance.delete(sym); } }

  // ---- Finnhub ----
  private openFinnhub() {
    if (this.finnhub && (this.finnhub.readyState === WebSocket.OPEN || this.finnhub.readyState === WebSocket.CONNECTING)) return;
    const tok = (process.env.NEXT_PUBLIC_FINNHUB_KEY ?? "").trim();
    if (!tok) { this.status = "error"; this.lastError = "FINNHUB token missing"; this.emit("error", this.lastError); return; }
    try {
      const ws = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(tok)}`);
      this.finnhub = ws; this.status = "connecting";
      ws.onopen = () => {
        this.status = "open"; this.finnhubConnected = true; this.emit("open", undefined as unknown as void);
        // send pending subs
        for (const s of this.finnhubSubs) { this.sendFinnhub({ type: "subscribe", symbol: s }); }
      };
      ws.onerror = () => { this.status = "error"; this.lastError = "finnhub ws error"; this.emit("error", this.lastError); };
      ws.onclose = () => { this.finnhubConnected = false; this.emit("close", undefined as unknown as void); };
      ws.onmessage = (ev: MessageEvent) => {
        const raw = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);
        try {
          const j = JSON.parse(raw) as { type?: string; data?: Array<{ p?: number; s?: string; t?: number }> };
          if (j.type === "trade" && Array.isArray(j.data)) {
            for (const d of j.data) {
              const p = Number(d.p); const ts = Number(d.t); const s = String(d.s ?? "");
              if (Number.isFinite(p) && Number.isFinite(ts) && s) this.pushTick({ provider: "finnhub", symbol: s, price: p, ts, iso: nowIso() });
            }
          }
        } catch { /* noop */ }
      };
    } catch (e) { this.status = "error"; this.lastError = e instanceof Error ? e.message : String(e); this.emit("error", this.lastError); }
  }
  private sendFinnhub(obj: { type: "subscribe" | "unsubscribe"; symbol: string }) { try { this.finnhub?.send(JSON.stringify(obj)); } catch { /* noop */ } }

  // ---- Yahoo ----
  private startYahoo(sym: string) {
    this.status = "connecting";
    const poll = async () => {
      try {
        const url = `/api/quote?symbols=${encodeURIComponent(sym)}`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json() as { quoteResponse?: { result?: Array<{ regularMarketPrice?: number; regularMarketTime?: number }> } };
        const row = j.quoteResponse?.result?.[0];
        const price = Number(row?.regularMarketPrice);
        const t = Number(row?.regularMarketTime);
        if (Number.isFinite(price)) {
          const ts = Number.isFinite(t) ? t * 1000 : Date.now();
          if (this.status !== "open") this.status = "open";
          this.pushTick({ provider: "yahoo", symbol: sym, price, ts, iso: nowIso() });
        }
      } catch { /* noop */ }
    };
    // first shot immediate
    void poll();
    const handle = window.setInterval(poll, 1500);
    this.yahooTimers.set(sym, handle);
  }
}

export const localStream = new LocalStream();
