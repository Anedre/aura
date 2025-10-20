"use client";

// Lightweight, typed WebSocket singleton for Aura

export type Tick = {
  provider: "binance" | "finnhub" | "yahoo";
  symbol: string;
  price: number;
  ts: number; // epoch ms
  iso: string;
  stale?: boolean;
};

export type ServerMsg =
  | { type: "ack" | "ack_unsub"; provider: string; symbol: string; assetId?: string; message?: string; timestamp?: string }
  | { type: "error"; message: string }
  | { type: "ticks"; data: Tick[] };

export type ClientMsg =
  | { action: "subscribe"; assetId: string; provider: "auto" }
  | { action: "unsubscribe"; assetId: string; provider: "auto" }
  // Symbol + provider (router explícito)
  | { action: "subscribe"; symbol: string; provider: "binance" | "finnhub" | "yahoo" }
  | { action: "unsubscribe"; symbol: string; provider: "binance" | "finnhub" | "yahoo" };

type EventMap = {
  open: void;
  close: { code?: number; reason?: string } | void;
  error: string;
  errorMsg: string; // server error payload
  ack: Extract<ServerMsg, { type: "ack" | "ack_unsub" }>;
  ticks: Tick[];
};

type Listener<K extends keyof EventMap> = (payload: EventMap[K]) => void;

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isTick(x: unknown): x is Tick {
  if (!isObject(x)) return false;
  const p = (x as Record<string, unknown>);
  return (
    (p.provider === "binance" || p.provider === "finnhub" || p.provider === "yahoo") &&
    typeof p.symbol === "string" && typeof p.price === "number" && Number.isFinite(p.price) &&
    typeof p.ts === "number" && Number.isFinite(p.ts) && typeof p.iso === "string"
  );
}

function isServerMsg(x: unknown): x is ServerMsg {
  if (!isObject(x)) return false;
  const t = (x as { type?: unknown }).type;
  if (t === "error") return typeof (x as { message?: unknown }).message === "string";
  if (t === "ticks") {
    const data = (x as { data?: unknown }).data;
    return Array.isArray(data) && data.every(isTick);
  }
  if (t === "ack" || t === "ack_unsub") {
    const o = x as { provider?: unknown; symbol?: unknown };
    return typeof o.provider === "string" && typeof o.symbol === "string";
  }
  return false;
}

export type AckEvent = Extract<ServerMsg, { type: "ack" | "ack_unsub" }>;

class AuraWsClient {
  private ws: WebSocket | null = null;
  private baseUrl: string = (process.env.NEXT_PUBLIC_WS_URL ?? "").trim();
  private url: string = (process.env.NEXT_PUBLIC_WS_URL ?? "").trim();
  private listeners: { [K in keyof EventMap]: Set<Listener<K>> } = {
    open: new Set(), close: new Set(), error: new Set(), errorMsg: new Set(), ack: new Set(), ticks: new Set(),
  };
  // Suscripciones pendientes (clave -> mensaje completo para reenviar en onopen)
  private subs = new Map<string, ClientMsg>();
  private reconnectTries = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private lastMsgAt = 0;
  private manualClose = false;

  on<K extends keyof EventMap>(ev: K, cb: Listener<K>): void {
    this.listeners[ev].add(cb as never);
  }
  off<K extends keyof EventMap>(ev: K, cb: Listener<K>): void {
    this.listeners[ev].delete(cb as never);
  }
  private emit<K extends keyof EventMap>(ev: K, payload: EventMap[K]): void {
    for (const cb of this.listeners[ev]) {
      try { (cb as (p: EventMap[K]) => void)(payload); } catch { /* noop */ }
    }
  }

  get configured(): boolean { return !!this.url; }
  get readyState(): number { return this.ws?.readyState ?? WebSocket.CLOSED; }

  private buildUrl(): string | null {
    const u = (this.baseUrl ?? "").trim();
    if (!u) return null;
    try {
      const append = String(process.env.NEXT_PUBLIC_WS_APPEND_ID_TOKEN ?? "").toLowerCase() === "true";
      const param = (process.env.NEXT_PUBLIC_WS_TOKEN_PARAM ?? "").trim();
      if (append && param && !u.includes(`${param}=`)) {
        // Import on demand to avoid SSR issues
        // Note: connect() is called client-side only
        // We cannot await here; handled in openSocket fallback
      }
    } catch { /* noop */ }
    return u;
  }

  async connect(): Promise<void> {
    const raw = this.buildUrl();
    if (!raw) {
      this.emit("error", "WS URL missing");
      return;
    }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.manualClose = false;
    // Opcional: agregar token en query si está habilitado
    const append = String(process.env.NEXT_PUBLIC_WS_APPEND_ID_TOKEN ?? "").toLowerCase() === "true";
    const param = (process.env.NEXT_PUBLIC_WS_TOKEN_PARAM ?? "").trim();
    let finalUrl = raw;
    if (append && param && !finalUrl.includes(`${param}=`)) {
      try {
        const { getIdToken } = await import("@/lib/auth");
        const tok = await getIdToken();
        if (tok) { const u = new URL(finalUrl); u.searchParams.set(param, tok); finalUrl = u.toString(); }
      } catch { /* noop */ }
    }
    this.url = finalUrl;
    this.openSocket();
  }

  private openSocket(): void {
    try {
      this.clearTimers();
      const ws = new WebSocket(this.url);
      this.ws = ws;
      this.lastMsgAt = Date.now();

      ws.onopen = () => {
        this.reconnectTries = 0;
        this.emit("open", undefined as unknown as void);
        // re-subscribe everything
        for (const [, msg] of this.subs) {
          this.send(msg);
        }
        this.startWatchdog();
      };

      ws.onmessage = (ev: MessageEvent) => {
        this.lastMsgAt = Date.now();
        const raw = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);
        let msgUnknown: unknown;
        try { msgUnknown = JSON.parse(raw); } catch { return; }
        if (!isServerMsg(msgUnknown)) return;
        const msg = msgUnknown as ServerMsg;
        if (msg.type === "error") {
          this.emit("errorMsg", msg.message);
        } else if (msg.type === "ack" || msg.type === "ack_unsub") {
          this.emit("ack", msg);
        } else if (msg.type === "ticks") {
          this.emit("ticks", msg.data);
        }
      };

      ws.onerror = () => {
        this.emit("error", "WebSocket error");
      };

      ws.onclose = (ev: CloseEvent) => {
        this.emit("close", { code: ev.code, reason: ev.reason });
        this.clearTimers();
        this.ws = null;
        if (!this.manualClose) this.scheduleReconnect();
      };
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      this.emit("error", m);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.manualClose) return;
    const tries = this.reconnectTries++;
    const base = Math.min(30_000, 1_000 * Math.pow(2, Math.max(0, tries)));
    const jitter = Math.floor(Math.random() * 800); // 0..800ms
    const delay = Math.max(1_000, Math.min(30_000, base + jitter));
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
  }

  private startWatchdog(): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = setInterval(() => {
      const idleMs = Date.now() - this.lastMsgAt;
      if (idleMs > 45_000) {
        try { this.ws?.close(); } catch { /* noop */ }
        // onclose will schedule reconnect
      }
    }, 10_000);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.watchdogTimer) { clearInterval(this.watchdogTimer); this.watchdogTimer = null; }
  }

  close(): void {
    this.manualClose = true;
    this.clearTimers();
    try { this.ws?.close(); } catch { /* noop */ }
  }

  send(obj: ClientMsg): boolean {
    const s = this.ws;
    if (!s || s.readyState !== WebSocket.OPEN) return false;
    try { s.send(JSON.stringify(obj)); return true; } catch { return false; }
  }

  // AssetId helpers (compat)
  subscribe(assetId: string): void {
    const id = (assetId ?? "").trim();
    if (!id) return;
    const key = `I|${id}`;
    const msg: ClientMsg = { action: "subscribe", assetId: id, provider: "auto" };
    this.subs.set(key, msg);
    this.send(msg);
  }

  unsubscribe(assetId: string): void {
    const id = (assetId ?? "").trim();
    if (!id) return;
    const key = `I|${id}`;
    this.subs.delete(key);
    this.send({ action: "unsubscribe", assetId: id, provider: "auto" });
  }

  // Symbol+provider helpers
  subscribeSymbol(symbol: string, provider: "binance" | "finnhub" | "yahoo"): void {
    const s = (symbol ?? "").trim();
    if (!s) return;
    const p = provider as "binance" | "finnhub" | "yahoo";
    const key = `S|${p}|${s}`;
    const msg: ClientMsg = { action: "subscribe", symbol: s, provider: p };
    this.subs.set(key, msg);
    this.send(msg);
  }
  unsubscribeSymbol(symbol: string, provider: "binance" | "finnhub" | "yahoo"): void {
    const s = (symbol ?? "").trim();
    if (!s) return;
    const p = provider as "binance" | "finnhub" | "yahoo";
    const key = `S|${p}|${s}`;
    this.subs.delete(key);
    this.send({ action: "unsubscribe", symbol: s, provider: p });
  }
}

export const auraWs = new AuraWsClient();
