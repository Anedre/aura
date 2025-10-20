import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic"; // disable caching by default
export const revalidate = 0;

type YahooQuoteRow = { regularMarketPrice?: number; regularMarketTime?: number };
type YahooApiResponse = {
  quoteResponse?: { result?: YahooQuoteRow[] };
};

async function fetchYahoo(symbols: string): Promise<YahooApiResponse> {
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
  const headers = {
    "User-Agent": ua,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://finance.yahoo.com/",
    Connection: "keep-alive",
  } as Record<string, string>;

  const query2 = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
  const query1 = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 3500);
  try {
    let r = await fetch(query2, { headers, cache: "no-store", signal: ctl.signal });
    if (!r.ok) {
      r = await fetch(query1, { headers, cache: "no-store", signal: ctl.signal });
      if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
    }
    const j = (await r.json()) as YahooApiResponse;
    return j;
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbols = searchParams.get("symbols") ?? searchParams.get("symbol");
  if (!symbols) {
    return new Response(JSON.stringify({ error: "missing symbols" }), {
      status: 400,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  try {
    const j = await fetchYahoo(symbols);
    return new Response(JSON.stringify(j), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Return 200 with error payload to avoid console/network spam during dev
    return new Response(JSON.stringify({ error: msg, quoteResponse: { result: [] } }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}
