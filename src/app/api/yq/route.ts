import { NextRequest, NextResponse } from "next/server";

type Timeframe = "1s" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
type Candle = { t: number; o: number; h: number; l: number; c: number; v?: number };

function mapInterval(tf: Timeframe): string {
  switch (tf) {
    case "1s": return "1m";
    case "1m": return "1m";
    case "5m": return "5m";
    case "15m": return "15m";
    case "1h": return "60m";
    case "4h": return "60m";
    case "1d": return "1d";
    default: return "1m";
  }
}
function defaultRangeFor(tf: Timeframe): string {
  switch (tf) {
    case "1s":
    case "1m": return "5d";
    case "5m":
    case "15m": return "1mo";
    case "1h":
    case "4h": return "6mo";
    case "1d": return "1y";
    default: return "5d";
  }
}

export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") ?? "";
  const tf = (searchParams.get("tf") as Timeframe) || "1m";
  const userRange = searchParams.get("range") || "";

  if (!symbol) return NextResponse.json({ error: "symbol requerido" }, { status: 400 });

  const interval = mapInterval(tf);
  const range = userRange || defaultRangeFor(tf);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;

  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: `Yahoo HTTP ${r.status}` }, { status: 502 });

    const json = await r.json() as {
      chart?: { result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }> };
      }>};
    };

    const res = json.chart?.result?.[0];
    const ts = res?.timestamp ?? [];
    const q = res?.indicators?.quote?.[0];

    const o = q?.open ?? [], h = q?.high ?? [], l = q?.low ?? [], c = q?.close ?? [], v = q?.volume ?? [];

    const candles: Candle[] = [];
    const n = Math.min(ts.length, o.length, h.length, l.length, c.length);
    for (let i = 0; i < n; i++) {
      const ti = ts[i], oi = o[i], hi = h[i], li = l[i], ci = c[i];
      if ([ti, oi, hi, li, ci].every(Number.isFinite)) {
        candles.push({ t: ti * 1000, o: oi as number, h: hi as number, l: li as number, c: ci as number, v: Number.isFinite(v[i]) ? (v[i] as number) : undefined });
      }
    }

    return NextResponse.json({ candles, meta: { interval, range } }, { status: 200, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
