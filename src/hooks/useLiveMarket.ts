import { useEffect, useMemo, useRef, useState } from 'react';

export type TF = '5m' | '15m' | '1h' | '4h' | '1d';
export type Provider = 'auto' | 'yahoo' | 'binance';
export type YahooRange = '5d'|'1mo'|'3mo'|'6mo'|'1y'|'2y'|'5y'|'10y'|'ytd'|'max';

export interface Candle {
  t: number; o: number; h: number; l: number; c: number; v?: number;
}

export interface UseLiveMarketOptions {
  symbol: string;
  tf: TF;
  provider?: Provider;     // 'auto' por defecto
  refreshMs?: number;      // opcional (default: 30s intradía, 60s diario)
  baseUrl?: string;        // opcional override; por defecto toma la env var
  range?: YahooRange;      // ⬅️ nuevo: solo Yahoo lo usa (Binance lo ignora)
}

export interface LiveMarketState {
  candles: Candle[];
  lastPrice: number | null;
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_BASE = (process.env.NEXT_PUBLIC_AURAFEED_URL ?? '').replace(/\/$/, '');

function buildUrl(base: string, symbol: string, tf: TF, provider: Provider, range?: YahooRange): string {
  const u = new URL(`${base}/candles`);
  u.searchParams.set('symbol', symbol);
  u.searchParams.set('tf', tf);
  u.searchParams.set('provider', provider);
  if (range) u.searchParams.set('range', range); // Yahoo lo honrará; Binance lo ignora
  return u.toString();
}

export function useLiveMarket(opts: UseLiveMarketOptions): LiveMarketState {
  const { symbol, tf, provider = 'yahoo', refreshMs, baseUrl, range } = opts;
  const base = baseUrl ?? DEFAULT_BASE;

  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const lastPrice = useMemo<number | null>(() => {
    const n = candles.length;
    return n ? candles[n - 1].c : null;
  }, [candles]);

  useEffect(() => {
    let alive = true;

    async function load(): Promise<void> {
      if (!base) {
        setError('NEXT_PUBLIC_AURAFEED_URL no está configurada');
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        setError(null);

        const url = buildUrl(base, symbol, tf, provider, range);
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);

        const data = (await r.json()) as Candle[];
        if (!alive) return;
        setCandles(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Error desconocido');
      } finally {
        if (alive) setIsLoading(false);
      }
    }

    void load();
    const period = refreshMs ?? (tf === '1d' ? 60_000 : 30_000);
    timerRef.current = window.setInterval(load, period);

    return () => {
      alive = false;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [base, symbol, tf, provider, refreshMs, range]);

  return { candles, lastPrice, isLoading, error };
}
