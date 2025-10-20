import { useEffect, useMemo, useRef, useState } from 'react';
import { mapSymbol, mapTf } from '@/lib/market';

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
      const sym = (symbol ?? '').trim();
      if (!sym) {
        setCandles([]);
        setIsLoading(false);
        setError(null);
        return;
      }
      if (provider !== 'yahoo' && !base) {
        setError('NEXT_PUBLIC_AURAFEED_URL no está configurada');
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        setError(null);

        if (provider === 'yahoo') {
          const mapped = mapSymbol('yahoo', sym);
          const interval = mapTf('yahoo', tf);
          const yahooRange = range ?? (tf === '1d' ? '1mo' : '5d');
          const urlLocal = `/api/yahoo/candles?symbol=${encodeURIComponent(mapped)}&interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(yahooRange)}`;
          const resLocal = await fetch(urlLocal, { cache: 'no-store' });
          if (!resLocal.ok) throw new Error(`HTTP ${resLocal.status}`);
          const jLocal = await resLocal.json();
          const arrLocal: Candle[] = Array.isArray((jLocal as { candles?: unknown }).candles)
            ? ((jLocal as { candles: Candle[] }).candles)
            : (Array.isArray(jLocal) ? (jLocal as Candle[]) : []);
          if (!alive) return;
          setCandles(arrLocal);
          return;
        }

        const url = buildUrl(base, sym, tf, provider, range);
        let r = await fetch(url, { cache: 'no-store' });
        if (!r.ok && provider === 'binance') {
          // Fallback to Yahoo with a symbol remapped to Yahoo's format (e.g., BTCUSDT -> BTC-USD)
          const symYahoo = /USDT$/i.test(sym)
            ? `${sym.replace(/USDT$/i, '')}-USD`
            : (/-USD$/i.test(sym) ? sym : mapSymbol('yahoo', sym));
          const url2 = buildUrl(base, symYahoo, tf, 'yahoo', range);
          r = await fetch(url2, { cache: 'no-store' });
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);

        const j = await r.json();
        const arr: Candle[] = Array.isArray(j)
          ? (j as Candle[])
          : (Array.isArray((j as { candles?: unknown }).candles) ? ((j as { candles: Candle[] }).candles) : []);
        if (!alive) return;
        setCandles(arr);
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
