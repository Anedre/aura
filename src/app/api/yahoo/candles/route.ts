import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type YahooQuote = {
  open?: number[];
  high?: number[];
  low?: number[];
  close?: number[];
  volume?: number[];
};
type YahooResult = { timestamp?: number[]; indicators?: { quote?: YahooQuote[] } };
type YahooResponse = { chart?: { result?: YahooResult[] } };

function okYahoo(x: unknown): x is YahooResponse {
  if (typeof x !== "object" || x === null) return false;
  const chart = (x as Record<string, unknown>).chart;
  if (typeof chart !== "object" || chart === null) return false;
  const result = (chart as Record<string, unknown>).result;
  return Array.isArray(result);
}

async function fetchChart(symbol: string, interval: string, range: string, signal: AbortSignal): Promise<YahooResponse | null> {
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
  const headers = {
    "User-Agent": ua,
    Accept: "application/json, text/plain, */*",
    Referer: "https://finance.yahoo.com/",
  } as Record<string, string>;

  const q2 = new URL(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  q2.searchParams.set("interval", interval);
  q2.searchParams.set("range", range);
  const q1 = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  q1.searchParams.set("interval", interval);
  q1.searchParams.set("range", range);

  let r = await fetch(q2.toString(), { headers, cache: "no-store", signal });
  if (!r.ok) r = await fetch(q1.toString(), { headers, cache: "no-store", signal });
  if (!r.ok) return null;
  const j = (await r.json()) as unknown;
  if (!okYahoo(j)) return null;
  return j;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") ?? searchParams.get("symbols");
  const interval = searchParams.get("interval") ?? "5m"; // 5m|15m|60m|1d
  const range = searchParams.get("range") ?? "5d";
  if (!symbol) {
    return new Response(JSON.stringify({ error: "missing symbol", candles: [] }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    let data = await fetchChart(symbol, interval, range, ctl.signal);
    // Fallbacks si vino vacío o nulo
    const tryBuild = (resp: YahooResponse | null) => {
      if (!resp) return { candles: [] as Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> };
      const result = resp.chart?.result?.[0] as YahooResult | undefined;
      const ts = result?.timestamp ?? [];
      const q0: YahooQuote = result?.indicators?.quote?.[0] ?? {};
      const o = q0.open ?? [];
      const h = q0.high ?? [];
      const l = q0.low ?? [];
      const c = q0.close ?? [];
      const v = q0.volume ?? [];
      const n = Math.min(ts.length, o.length, h.length, l.length, c.length);
      const candles = new Array(n).fill(0).map((_, i) => ({ t: Number(ts[i]) * 1000, o: Number(o[i]), h: Number(h[i]), l: Number(l[i]), c: Number(c[i]), v: Number(v[i] ?? 0) }));
      return { candles };
    };
    let built = tryBuild(data);
    if (built.candles.length < 2) {
      // fallback 1: si pedimos intradía, intenta 60m/1mo
      if (interval !== "1d") {
        data = await fetchChart(symbol, "60m", "1mo", ctl.signal);
        built = tryBuild(data);
      }
    }
    if (built.candles.length < 2) {
      // fallback 2: diario 1y
      data = await fetchChart(symbol, "1d", "1y", ctl.signal);
      built = tryBuild(data);
    }
    if (built.candles.length < 2) {
      // fallback 3: diario max
      data = await fetchChart(symbol, "1d", "max", ctl.signal);
      built = tryBuild(data);
    }
    return new Response(JSON.stringify({ candles: built.candles }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg, candles: [] }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } finally {
    clearTimeout(t);
  }
}
