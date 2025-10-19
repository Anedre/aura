// src/lib/market.ts
// Capa unificada de mercado: normaliza símbolos/TF y rutea a proveedores.

export type Provider = "binance" | "yahoo" | "finnhub";
export type Timeframe = "5m" | "15m" | "1h" | "4h" | "1d";

export interface Candle {
  t: number; // epoch ms (UTC)
  o: number; h: number; l: number; c: number; v: number;
  fin: boolean;
}

// === Duración por TF (ms) ===
export const tfMs: Record<Timeframe, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

// Alinea timestamp al inicio de bucket TF
export function bucketStart(tsMs: number, tf: Timeframe): number {
  const size = tfMs[tf];
  return Math.floor(tsMs / size) * size;
}

// === Normalización de símbolo por proveedor ===
export function mapSymbol(provider: Provider, raw: string): string {
  if (provider === "binance") {
    // Binance: BTCUSDT (sin guión). Permite BTC-USDT / BTC-USD / BTCUSDT.
    const s = raw.replace("/", "-").toUpperCase();
    if (s.includes("-")) {
      const [base, quote] = s.split("-");
      const q = quote === "USD" ? "USDT" : quote;
      return `${base}${q}`;
    }
    // Si viene solo la base (p.ej. BTC), asumimos par contra USDT
    if (!/USDT$/.test(s) && !/USD$/.test(s)) {
      return `${s}USDT`;
    }
    // Si termina en USD y no en USDT, cambialo a USDT
    if (/USD$/.test(s) && !/USDT$/.test(s)) return s.replace(/USD$/, "USDT");
    return s;
  }
  if (provider === "yahoo") {
    // Yahoo: acepta AAPL, SPY, BTC-USD, EURUSD=X; normalizamos separador
    return raw.replace("/", "-");
  }
  // Finnhub: dejamos tal cual (puede incluir namespace)
  return raw;
}

// === Mapeo TF → intervalo/resolución (overloads tipados) ===
export function mapTf(provider: "binance", tf: Timeframe): "5m" | "15m" | "1h" | "4h" | "1d";
export function mapTf(provider: "yahoo",   tf: Timeframe): "5m" | "15m" | "60m" | "1d";
export function mapTf(provider: "finnhub", tf: Timeframe): "5"  | "15"  | "60"  | "240" | "D";
// overload general para unión `Provider`
export function mapTf(provider: Provider,  tf: Timeframe):
  "5m" | "15m" | "1h" | "4h" | "1d" | "60m" | "5" | "15" | "60" | "240" | "D";
export function mapTf(provider: Provider, tf: Timeframe) {
  if (provider === "binance") return tf;
  if (provider === "yahoo")   return (tf === "1h" ? "60m" : tf) as "5m" | "15m" | "60m" | "1d";
  const m: Record<Timeframe, "5" | "15" | "60" | "240" | "D"> = {
    "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D",
  };
  return m[tf];
}

// ======== Clasificación y sesiones de mercado ========
export type AssetClass = "crypto" | "forex" | "equity" | "etf" | "index" | "other";

export function classifySymbol(symRaw: string): AssetClass {
  const s = symRaw.toUpperCase();
  if (/([A-Z]{3})([A-Z]{3})=X$/.test(s) || /[A-Z]{3,5}\/[A-Z]{3,5}/.test(s)) return "forex";
  if (/^(BTC|ETH|SOL|ADA|XRP|DOGE|BNB|TRX|MATIC|DOT|AVAX|SHIB|LTC|UNI|LINK|NEAR|ATOM|ETC|OP|ARB|TON|BCH|APT|FIL|ALGO|AAVE|SUI|SEI|PEPE)(?:[-/]?(USD|USDT))?$/.test(s)) return "crypto";
  if (/^\^/.test(s)) return "index"; // Yahoo indices (ej. ^GSPC)
  if (/^(SPY|QQQ|TLT|GLD|DIA|IWM|EEM|HYG|XLK|XLE|XLF|XLV|XLY|XLI|XLP|XLB|XLU)$/.test(s)) return "etf";
  if (/^[A-Z]{1,5}$/.test(s)) return "equity";
  if (/-USDT$/.test(s) || /-USD$/.test(s) || /USDT$/.test(s)) return "crypto";
  return "other";
}

export type MarketSession = {
  market: string;            // etiqueta amigable
  class: AssetClass;
  is24x7?: boolean;
  is24x5?: boolean;
  isOpen?: boolean;
  nextCloseLocal?: string;   // hh:mm (zona local usuario)
  nextCloseISO?: string;     // ISO string
  nextOpenLocal?: string;
  nextOpenISO?: string;
  note?: string;             // explicación breve
};

function dateInTz(d: Date, timeZone: string): Date {
  // Construye un Date a partir de los componentes representados en esa TZ
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), 0, 0);
}

export function getSessionInfo(symbol: string): MarketSession {
  const klass = classifySymbol(symbol);
  if (klass === "crypto") {
    return {
      market: "Cripto",
      class: "crypto",
      is24x7: true,
      isOpen: true,
      note: "Cripto opera 24/7: no hay cierre diario. Los cambios se evalúan por ventanas de tiempo (por ejemplo, cada 24h UTC).",
    };
  }
  if (klass === "forex") {
    // Forex: 24x5, cierre el viernes por la tarde (NY)
    const tz = "America/New_York";
    const nowEt = dateInTz(new Date(), tz);
    const day = nowEt.getDay(); // 0=Dom .. 6=Sáb
    const closeToday = new Date(nowEt); closeToday.setHours(16, 0, 0, 0); // 16:00 ET aprox
    const sunOpen = (ref: Date) => { const d = new Date(ref); const add = (7 - d.getDay()) % 7; d.setDate(d.getDate() + add); d.setHours(17,0,0,0); return d; }; // domingo 17:00 ET
    const friClose = (ref: Date) => { const d = new Date(ref); const diff = 5 - d.getDay(); d.setDate(d.getDate() + (diff >= 0 ? diff : diff + 7)); d.setHours(16,0,0,0); return d; };
    const isOpen = (day >= 1 && day <= 4) || (day === 5 && nowEt < closeToday) || (day === 0 && nowEt.getHours() >= 17);
    const nextOpen = isOpen ? nowEt : sunOpen(nowEt);
    const nextClose = friClose(nowEt);
    return {
      market: "Forex (24/5)",
      class: "forex",
      is24x5: true,
      isOpen,
      nextCloseLocal: nextClose.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" }),
      nextCloseISO: new Date(nextClose.getTime()).toISOString(),
      nextOpenLocal: nextOpen.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" }),
      nextOpenISO: new Date(nextOpen.getTime()).toISOString(),
      note: "Forex opera 24/5. El 'cierre' relevante es el del viernes (NY), cuando el mercado pausa hasta el domingo.",
    };
  }
  if (klass === "equity" || klass === "etf" || klass === "index") {
    // Bolsa de EE.UU. (aprox): 09:30–16:00 ET, Lun–Vie
    const tz = "America/New_York";
    const nowEt = dateInTz(new Date(), tz);
    const close = new Date(nowEt); close.setHours(16, 0, 0, 0);
    const open = new Date(nowEt); open.setHours(9, 30, 0, 0);
    const day = nowEt.getDay();
    const isWeekday = day >= 1 && day <= 5;
    let next = close;
    if (!isWeekday || nowEt.getTime() > close.getTime()) {
      // Siguiente día hábil 16:00
      next = close;
      let add = 1;
      if (day === 5) add = 3; // viernes -> lunes
      if (day === 6) add = 2; // sábado -> lunes
      next.setDate(next.getDate() + add);
    }
    const isOpen = isWeekday && nowEt >= open && nowEt <= close;
    let nextOpen = open;
    if (!isWeekday || nowEt > close) {
      nextOpen = open; let add = 1; if (day === 5) add = 3; if (day === 6) add = 2; nextOpen.setDate(nextOpen.getDate() + add);
    } else if (nowEt < open) {
      nextOpen = open;
    }
    return {
      market: klass === "equity" ? "Acciones EE.UU." : klass === "etf" ? "ETF EE.UU." : "Índice EE.UU.",
      class: klass,
      isOpen,
      nextCloseLocal: next.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" }),
      nextCloseISO: new Date(next.getTime()).toISOString(),
      nextOpenLocal: nextOpen.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" }),
      nextOpenISO: new Date(nextOpen.getTime()).toISOString(),
      note: isOpen
        ? "El 'cierre de operaciones' es la hora en que termina la sesión regular (16:00 ET)."
        : "Fuera de sesión, puede haber after hours con menor liquidez.",
    };
  }
  return { market: "Mercado", class: "other", note: "Sesión no clasificada." };
}

// ========================= Fetchers REST =========================

// ---- Binance ----
export async function fetchBinanceCandles(
  symbol: string,
  interval: "5m" | "15m" | "1h" | "4h" | "1d",
  limit: number
): Promise<Candle[]> {
  const url = new URL("https://api.binance.com/api/v3/klines");
  url.searchParams.set("symbol", symbol.replace("-", ""));
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}: ${await res.text()}`);

  const rawUnknown: unknown = await res.json();
  if (!Array.isArray(rawUnknown) || !rawUnknown.every(Array.isArray)) {
    throw new Error("Binance: formato inesperado de klines");
  }

  type Row = [number, string | number, string | number, string | number, string | number, string | number, ...unknown[]];
  const rows = rawUnknown as Row[];

  return rows.map((r) => ({
    t: Number(r[0]),
    o: Number(r[1]),
    h: Number(r[2]),
    l: Number(r[3]),
    c: Number(r[4]),
    v: Number(r[5] ?? 0),
    fin: true,
  }));
}

// ---- Yahoo ----
type YahooQuote = {
  open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[];
};
type YahooResult = { timestamp?: number[]; indicators?: { quote?: YahooQuote[] } };
type YahooResponse = { chart?: { result?: YahooResult[] } };

function isYahooResponse(x: unknown): x is YahooResponse {
  if (typeof x !== "object" || x === null) return false;
  const chart = (x as Record<string, unknown>).chart;
  if (typeof chart !== "object" || chart === null) return false;
  const result = (chart as Record<string, unknown>).result;
  return Array.isArray(result);
}

export async function fetchYahooCandles(
  symbol: string,
  interval: "5m" | "15m" | "60m" | "1d",
  limit: number
): Promise<Candle[]> {
  const minutesPerBar =
    interval === "5m" ? 5 : interval === "15m" ? 15 : interval === "60m" ? 60 : 1440;
  const totalMinutes = minutesPerBar * limit;
  let range = "1d";
  if (minutesPerBar >= 60 && minutesPerBar < 1440) {
    range = totalMinutes <= 1440 ? "1d" : totalMinutes <= 7 * 1440 ? "5d" : "1mo";
  } else if (minutesPerBar === 1440) {
    range = totalMinutes <= 365 ? "1y" : "5y";
  } else {
    range = totalMinutes <= 7 * 1440 ? "5d" : "1mo";
  }

  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("interval", interval);
  url.searchParams.set("range", range);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}: ${await res.text()}`);

  const jsonUnknown: unknown = await res.json();
  if (!isYahooResponse(jsonUnknown)) throw new Error("Yahoo: estructura inesperada");

  const result = jsonUnknown.chart!.result![0];
  const ts = result.timestamp ?? [];
  const q0: YahooQuote = result.indicators?.quote?.[0] ?? {};

  const o = q0.open ?? [];
  const h = q0.high ?? [];
  const l = q0.low ?? [];
  const c = q0.close ?? [];
  const v = q0.volume ?? [];

  const n = Math.min(ts.length, o.length, h.length, l.length, c.length);
  const out: Candle[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = {
      t: (ts[i] as number) * 1000, // Yahoo entrega en segundos
      o: Number(o[i]), h: Number(h[i]), l: Number(l[i]), c: Number(c[i]),
      v: Number(v[i] ?? 0), fin: true,
    };
  }
  return out.slice(-limit);
}

// ---- Finnhub ----
export async function fetchFinnhubCandles(
  symbol: string,
  resolution: "5" | "15" | "60" | "240" | "D",
  limit: number
): Promise<Candle[]> {
  const token = (process.env.FINNHUB_TOKEN ?? "").trim();
  if (!token) throw new Error("Finnhub: falta FINNHUB_TOKEN");

  const minutes =
    resolution === "5" ? 5 : resolution === "15" ? 15 : resolution === "60" ? 60 :
    resolution === "240" ? 240 : 1440;

  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - (minutes * 60 * limit);

  const url = new URL("https://finnhub.io/api/v1/stock/candle");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("resolution", resolution);
  url.searchParams.set("from", String(fromSec));
  url.searchParams.set("to", String(nowSec));
  url.searchParams.set("token", token);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}: ${await res.text()}`);

  const jUnknown: unknown = await res.json();
  if (typeof jUnknown !== "object" || jUnknown === null) throw new Error("Finnhub: respuesta inválida");
  const j = jUnknown as { s?: string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[] };
  if (j.s !== "ok" || !Array.isArray(j.t) || !Array.isArray(j.o) || !Array.isArray(j.h) || !Array.isArray(j.l) || !Array.isArray(j.c)) {
    throw new Error(`Finnhub error: ${j.s ?? "unknown"}`);
  }

  const out: Candle[] = [];
  for (let i = 0; i < j.t.length; i++) {
    out.push({
      t: j.t[i] * 1000,
      o: Number(j.o[i]),
      h: Number(j.h[i]),
      l: Number(j.l[i]),
      c: Number(j.c[i]),
      v: Number(j.v?.[i] ?? 0),
      fin: true,
    });
  }
  return out.slice(-limit);
}

// ---- Helpers ----
function isBinanceInvalidSymbol(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? "");
  return /Invalid\s*symbol/i.test(m) || /(-?404)/.test(m);
}

// ========================= Router AUTO =========================

export type AutoCandles = {
  provider: Provider; symbol: string; tf: string; candles: Candle[]; fallback?: boolean;
};

export async function fetchCandlesAuto(
  symbolRaw: string,
  tfRaw: Timeframe,
  requested: Provider | "auto",
  limit: number
): Promise<AutoCandles> {
  // 1) Elegir proveedor inicial
  const p1: Provider = requested === "auto"
    ? (/^[A-Z]+-(USD|USDT)$/i.test(symbolRaw) ? "binance" : "yahoo")
    : requested;

  // 2) Normalizar símbolo por proveedor
  const s1 = mapSymbol(p1, symbolRaw);

  // 3) Fetch por rama con TF mapeado y NARROW correcto
  try {
    if (p1 === "binance") {
      const t = mapTf("binance", tfRaw); // "5m" | "15m" | "1h" | "4h" | "1d"
      const candles = await fetchBinanceCandles(s1, t, limit);
      return { provider: p1, symbol: s1, tf: t, candles };
    }
    if (p1 === "yahoo") {
      const t = mapTf("yahoo", tfRaw); // "5m" | "15m" | "60m" | "1d"
      const candles = await fetchYahooCandles(s1, t, limit);
      return { provider: p1, symbol: s1, tf: t, candles };
    }
    {
      const t = mapTf("finnhub", tfRaw); // "5" | "15" | "60" | "240" | "D"
      const candles = await fetchFinnhubCandles(s1, t, limit);
      return { provider: p1, symbol: s1, tf: t, candles };
    }
  } catch (e) {
    // 4) Fallback: si auto+binance falla por símbolo inválido → Yahoo
    if (requested === "auto" && p1 === "binance" && isBinanceInvalidSymbol(e)) {
      const p2: Provider = "yahoo";
      const s2 = mapSymbol(p2, symbolRaw);
      const t2 = mapTf("yahoo", tfRaw); // narrow literal para llamada segura
      const candles2 = await fetchYahooCandles(s2, t2, limit);
      return { provider: p2, symbol: s2, tf: t2, candles: candles2, fallback: true };
    }
    throw e;
  }
}
