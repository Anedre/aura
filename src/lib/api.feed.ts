// src/lib/api.feed.ts
// API del Feed: tipos estrictos + fetch tipado. Reutiliza cabeceras Auth del cliente.

const SHOULD_PROXY = (() => {
  const raw = process.env.NEXT_PUBLIC_AURA_PROXY;
  if (typeof raw !== "string") return false;
  return /^(1|true|yes)$/i.test(raw.trim());
})();

const FEED_ROOT = (() => {
  const specific = process.env.NEXT_PUBLIC_AURAFEED_URL?.trim();
  if (specific) return specific.replace(/\/+$/, "");

  const base = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (base) return `${base.replace(/\/+$/, "")}/v1`;
  return null;
})();

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type Action = "BUY" | "SELL" | "HOLD" | "ABSTAIN";
export type Horizon = "1d" | "1w" | "1h" | "15m" | string;

export interface Stops {
  tp: number;
  sl: number;
}

export interface FeedItem {
  symbol: string;
  action: Action;
  asset_type?: string;
  model_kind?: string;
  model_script?: string;
  p_conf?: number;                 // 0..1
  p_up?: number;
  p_up_mean?: number;
  p_up_std?: number;
  sigma?: number;
  sigma_limit?: number | null;
  thr_buy?: number;
  thr_sell?: number;
  thr_uncert?: number;
  margin?: number;
  quality?: number | string;
  source?: string;
  hold_reason?: string | null;
  mc_passes?: number;
  horizon?: Horizon;
  ts?: string;                     // ISO
  last_close?: number;
  atr14?: number;
  ci_low?: number;
  ci_high?: number;
  model_version?: string;
  abstain_reason?: string | null;
  stops?: Stops | null;            // ?? TIPO FUERTE (no {} ni unknown)
  [k: string]: unknown;
}

/** Obtiene el feed. `q` puede ser URLSearchParams, string o record plano. */
export async function getFeed(
  q: URLSearchParams | string | Record<string, string | number | boolean>,
): Promise<FeedItem[]> {
  let query: string;
  if (q instanceof URLSearchParams) query = `?${q.toString()}`;
  else if (typeof q === "string") query = q.startsWith("?") ? q : `?${q}`;
  else {
    query = `?${new URLSearchParams(
      Object.entries(q).map(([k, v]) => [k, String(v)]),
    ).toString()}`;
  }
  const directBase = !SHOULD_PROXY && typeof FEED_ROOT === "string" && FEED_ROOT.length > 0 ? FEED_ROOT : null;
  if (!directBase) {
    throw new Error("NEXT_PUBLIC_AURAFEED_URL no está configurada");
  }

  const init: RequestInit = {
    method: "GET",
    headers: {
      "content-type": "application/json",
    },
    cache: "no-store",
    mode: "cors",
  };

  const targetUrl = `${directBase}/feed${query}`;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(targetUrl, init);
      if (res.ok) {
        return (await res.json()) as FeedItem[];
      }
      const status = res.status;
      const payload = await res.text();
      if (!RETRYABLE_STATUS.has(status) || attempt === MAX_ATTEMPTS) {
        throw new Error(payload || `HTTP ${status}`);
      }
      lastError = payload || `HTTP ${status}`;
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) throw err;
      lastError = err;
    }

    const backoff = Math.min(1500, 200 * attempt * attempt);
    await sleep(backoff);
  }

  throw (lastError instanceof Error ? lastError : new Error(String(lastError ?? "Unknown error")));
}

// alias de compatibilidad si tenias imports antiguos
export const fetchFeed = getFeed;
