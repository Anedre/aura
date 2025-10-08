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
