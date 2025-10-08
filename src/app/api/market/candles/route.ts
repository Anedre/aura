// src/app/api/market/candles/route.ts
import { NextRequest, NextResponse } from "next/server";

type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

interface Candle {
  t: number; // openTime ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  fin: boolean;
}

/** Tupla exacta de /api/v3/klines (Binance) */
type BinanceKlineRow = readonly [
  number, // openTime
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // closeTime
  string, // quoteAssetVolume
  number, // numberOfTrades
  string, // takerBuyBaseVolume
  string, // takerBuyQuoteVolume
  string  // ignore
];

const tfToBinance = (tf: Timeframe) => tf;
const toNum = (s: string): number => Number.parseFloat(s);

/** Normaliza símbolos del front a formato Binance */
function normalizeToBinance(sym: string): string {
  const s = sym.toUpperCase().trim();
  // ya válido (ej. BTCUSDT)
  if (/^[A-Z0-9]{6,}$/.test(s) && /USDT$/.test(s)) return s;

  // BTC-USD, BTC/USD, BTCUSD → BTCUSDT
  const base = s.replace(/[-/]/g, "");
  if (/USD$/.test(base) && !/USDT$/.test(base)) {
    return base.replace(/USD$/, "USDT");
  }
  // BTC-TRX → BTCTRX (pares cripto-cripto)
  if (/-|\/ /.test(sym)) return s.replace(/[-/]/g, "");
  return s;
}

const isBinanceKlineRow = (row: unknown): row is BinanceKlineRow => {
  if (!Array.isArray(row)) return false;
  return (
    typeof row[0] === "number" &&
    typeof row[1] === "string" &&
    typeof row[2] === "string" &&
    typeof row[3] === "string" &&
    typeof row[4] === "string" &&
    typeof row[5] === "string" &&
    typeof row[6] === "number"
  );
};

async function fetchBinance(
  symbol: string,
  tf: Timeframe,
  limit = 300
): Promise<Candle[]> {
  const norm = normalizeToBinance(symbol);
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(
    norm
  )}&interval=${tfToBinance(tf)}&limit=${limit}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    // Intentar leer el cuerpo de error para log
    let msg = `Binance ${res.status}`;
    try {
      const txt = await res.text();
      if (txt) msg += `: ${txt}`;
    } catch { /* noop */ }
    throw new Error(msg);
  }

  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) throw new Error("Formato inesperado en Binance");

  const rows: BinanceKlineRow[] = raw.filter(isBinanceKlineRow);

  return rows.map((r) => ({
    t: r[0],
    o: toNum(r[1]),
    h: toNum(r[2]),
    l: toNum(r[3]),
    c: toNum(r[4]),
    v: toNum(r[5]),
    fin: true, // históricas cerradas
  }));
}

// Stub de Yahoo (sin warnings)
async function fetchYahoo(_symbol: string, _tf: Timeframe): Promise<Candle[]> {
  void _symbol; void _tf;
  return [];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbolRaw = (searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();
  const tfParam = (searchParams.get("tf") ?? "5m") as string;
  const tf: Timeframe = (["1m","5m","15m","1h","4h","1d"] as const).includes(tfParam as Timeframe)
    ? (tfParam as Timeframe) : "5m";
  const limitParam = Number.parseInt(searchParams.get("limit") ?? "300", 10);
  const limit = Number.isNaN(limitParam) ? 300 : limitParam;
  const provider = (searchParams.get("provider") ?? "binance").toLowerCase();
  // 'range' llega del front, no lo usamos aquí, pero puede influir en tu hook

  try {
    const candles =
      provider === "yahoo"
        ? await fetchYahoo(symbolRaw, tf)
        : await fetchBinance(symbolRaw, tf, limit);

    return NextResponse.json({ candles, providerUsed: provider });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error desconocido";
    // Log para server (útil en dev)
    console.error("[/api/market/candles] ", { symbolRaw, tf, limit, provider, message });
    // No rompas el front: regresa 200 con arreglo vacío + error
    return NextResponse.json({ candles: [], error: message }, { status: 200 });
  }
}
