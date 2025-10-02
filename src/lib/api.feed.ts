import { apiFetch } from "./core/http";

/** Horizonte de señal admitido en el backend */
export type Horizon = "1d" | "1w";

/** Item del feed principal (AURA) */
export type FeedItem = {
  symbol: string;
  action: "BUY" | "SELL" | "ABSTAIN" | "HOLD";
  p_conf?: number;
  sigma?: number;
  horizon?: Horizon;
  ts?: string;
  last_close?: number;
  stops?: { tp: number; sl: number } | null;
  model_version?: string;
  abstain_reason?: string;
  sigma_limit?: number;
};

function toQS(params?: string | { horizon?: Horizon; min_conf?: number }) {
  if (!params) return "horizon=1d&min_conf=0.55";
  if (typeof params === "string") return params.replace(/^\?/, "");
  const h = params.horizon ?? "1d";
  const m = params.min_conf ?? 0.55;
  return `horizon=${encodeURIComponent(h)}&min_conf=${m}`;
}

/** Feed de señales */
export async function getFeed(
  params?: string | { horizon?: Horizon; min_conf?: number }
): Promise<FeedItem[]> {
  return apiFetch<FeedItem[]>(`/v1/feed?${toQS(params)}`);
}

/** Detalle de activo + señales */
export async function getAsset(symbol: string, bars?: number): Promise<unknown> {
  const q = bars && Number.isFinite(bars) ? `?w=${bars}` : "";
  return apiFetch(`/v1/asset/${encodeURIComponent(symbol)}${q}`);
}

/** Recomendación por activo (para la página /asset) */
export type AssetRecommendation = {
  action: "BUY" | "SELL" | "ABSTAIN" | "HOLD";
  p_conf?: number;
  stops?: { tp: number; sl: number } | null;
};

export async function recommendByAsset(symbol: string): Promise<AssetRecommendation> {
  const sym = symbol.toUpperCase();
  // 1) Intento con endpoint dedicado (si existe)
  try {
    return await apiFetch<AssetRecommendation>(
      `/v1/recommend/asset?symbol=${encodeURIComponent(sym)}`
    );
  } catch {
    // 2) Fallback: tomar del feed 1d
    try {
      const items = await getFeed({ horizon: "1d", min_conf: 0 });
      const found = items.find((x) => x.symbol?.toUpperCase() === sym);
      if (found) {
        return {
          action: found.action,
          p_conf: found.p_conf,
          stops: found.stops ?? null,
        };
      }
    } catch {}
    // 3) Último recurso
    return { action: "ABSTAIN", p_conf: 0, stops: null };
  }
}
