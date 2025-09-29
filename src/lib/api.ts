// src/lib/api.ts
/** BASES (compat) */
const API_FEED_RAW =
  process.env.NEXT_PUBLIC_AURA_API_FEED ?? process.env.NEXT_PUBLIC_AURA_API ?? "";
export const API_FEED = API_FEED_RAW.trim().replace(/\/+$/, "");
const API_PAPER_RAW = process.env.NEXT_PUBLIC_AURA_API ?? "";
export const API_PAPER = API_PAPER_RAW.trim().replace(/\/+$/, "");
export const API_BASE = API_FEED;

/** Tipos */
export type Horizon = "1d" | "1w";
export type FeedItem = {
  symbol: string;
  action: "BUY" | "SELL" | "ABSTAIN" | "HOLD";
  p_conf?: number;
  sigma?: number;
  horizon?: Horizon;
  ts?: string;
  last_close?: number | null;
  stops?: { tp: number; sl: number } | null;
  model_version?: string;
  abstain_reason?: string | null;
  sigma_limit?: number | null;
};
export type Ohlcv = { t: string; o: number; h: number; l: number; c: number; v?: number };
export type Signal = {
  ts: string;
  action: "BUY" | "SELL" | "ABSTAIN" | "HOLD";
  p_conf?: number;
  sigma?: number;
  band_low?: number;
  band_high?: number;
};
export type AssetDetail = {
  symbol: string;
  horizon?: Horizon;
  ohlcv?: Ohlcv[];
  signals?: Signal[];
  stops?: { tp: number; sl: number } | null;
  last_close?: number | null;
};
export type PaperTrade = {
  ts: string; symbol: string; side: "BUY" | "SELL";
  qty: number; price: number; effective_price: number;
  fees_bp: number; slippage_bp: number; trade_id: string; user: string;
};
export type PostPaperTradeInput = {
  user: string; symbol: string; side: "BUY"|"SELL"; qty: number; price: number;
  fees_bp?: number; slippage_bp?: number;
};
export type PaperKPIs = {
  realized_pnl: number; trades_closed: number; max_drawdown: number; sharpe: number;
  open_positions: Array<{ symbol: string; qty: number; avg_effective_px: number }>;
  n_trades: number;
};
export type PaperSummary = { trades: PaperTrade[]; kpis: PaperKPIs };

/** Utils */
export function qs(params: Record<string, any>) {
  const f = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return f.length ? `?${f.join("&")}` : "";
}
async function getJSON<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, cache: "no-store" });
  if (!r.ok) throw new Error(`[GET ${url}] ${r.status} ${r.statusText} ${await r.text().catch(()=> "")}`);
  return r.json() as Promise<T>;
}
async function postJSON<T = unknown>(url: string, body: unknown, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: JSON.stringify(body ?? {}), cache: "no-store", ...init,
  });
  if (!r.ok) throw new Error(`[POST ${url}] ${r.status} ${r.statusText} ${await r.text().catch(()=> "")}`);
  return r.json() as Promise<T>;
}

/** FEED */
export async function fetchFeed(opts: { horizon: Horizon; min_conf?: number }): Promise<FeedItem[]> {
  const { horizon, min_conf } = opts ?? { horizon: "1d" };
  return getJSON<FeedItem[]>(`${API_FEED}/v1/feed${qs({ horizon, min_conf })}`);
}
export async function fetchFeedSimple(h: Horizon = "1d"): Promise<FeedItem[]> {
  return fetchFeed({ horizon: h });
}

/** ASSET DETAIL */
export async function fetchAssetDetail(symbol: string, windowBars = 120): Promise<AssetDetail> {
  return getJSON<AssetDetail>(`${API_FEED}/v1/asset/${encodeURIComponent(symbol)}/detail${qs({ window: windowBars })}`);
}

/** PAPER TRADING */
export async function fetchPaperTrades(user: string, limit = 500): Promise<PaperTrade[]> {
  return getJSON<PaperTrade[]>(`${API_PAPER}/v1/paper_trade/list${qs({ user, limit })}`);
}
export async function postPaperTrade(input: PostPaperTradeInput): Promise<{ trade_id: string; effective_price: number }> {
  return postJSON(`${API_PAPER}/v1/paper_trade/post`, {
    user: input.user, symbol: input.symbol, side: input.side, qty: input.qty, price: input.price,
    fees_bp: input.fees_bp ?? 0, slippage_bp: input.slippage_bp ?? 0,
  });
}
export async function fetchPaperSummary(user: string, limit = 500): Promise<PaperSummary> {
  try {
    const data = await getJSON<PaperSummary>(`${API_PAPER}/v1/paper_trade/summary${qs({ user, limit })}`);
    if (data && Array.isArray(data.trades) && data.kpis) return data;
  } catch {}
  const trades = await fetchPaperTrades(user, limit);
  const kpis = computeKPIsFallback(trades);
  return { trades, kpis };
}

/** AUTH + PERFIL (mock si no hay backend) */
export type Session = { user_id: string; email: string; token: string };
export type UserProfile = {
  user_id: string;
  objective?: "ahorro" | "crecimiento" | "ingresos" | "mixto";
  risk?: "conservador" | "moderado" | "agresivo";
  horizon_months?: number; capital?: number; constraints?: string[];
};
export async function login(email: string, password: string): Promise<Session> {
  const url = `${API_PAPER}/v1/auth/login`;
  try { return await postJSON<Session>(url, { email, password }); }
  catch { return { user_id: email, email, token: `dev-${Math.random().toString(36).slice(2,10)}` }; }
}
export async function getProfile(user_id: string): Promise<UserProfile> {
  try { return await getJSON<UserProfile>(`${API_PAPER}/v1/profile${qs({ user_id })}`); }
  catch { return { user_id, objective: "crecimiento", risk: "moderado", horizon_months: 12, capital: 1000, constraints: [] }; }
}
export async function updateProfile(profile: UserProfile): Promise<UserProfile> {
  try { return await postJSON<UserProfile>(`${API_PAPER}/v1/profile/update`, profile); }
  catch { return profile; }
}

/** RECOMENDACIONES */
export type AssetRecommendation = {
  symbol: string; action: "BUY" | "SELL" | "ABSTAIN";
  p_conf?: number; stops?: { tp: number; sl: number } | null; model_version?: string;
};
export type ProfileRecommendations = {
  user_id: string;
  items: Array<AssetRecommendation & { score?: number }>;
};

function toRecAction(a: FeedItem["action"]): "BUY" | "SELL" | "ABSTAIN" {
  return a === "BUY" ? "BUY" : a === "SELL" ? "SELL" : "ABSTAIN";
}

export async function recommendByAsset(symbol: string): Promise<AssetRecommendation> {
  const url = `${API_FEED}/v1/recommend/asset${qs({ symbol })}`;
  try { return await getJSON<AssetRecommendation>(url); }
  catch {
    const feed = await fetchFeed({ horizon: "1d" });
    const item = feed.find(f => f.symbol.toUpperCase() === symbol.toUpperCase()) ?? feed[0] ?? {
      symbol, action: "ABSTAIN" as const,
    };
    return {
      symbol: item.symbol,
      action: toRecAction(item.action),
      p_conf: item.p_conf,
      stops: item.stops ?? null,
      model_version: item.model_version,
    };
  }
}

export async function recommendByProfile(user_id: string): Promise<ProfileRecommendations> {
  const url = `${API_FEED}/v1/recommend/profile${qs({ user_id, topk: 5 })}`;
  try { return await getJSON<ProfileRecommendations>(url); }
  catch {
    const feed = await fetchFeed({ horizon: "1d" });
    const items: Array<AssetRecommendation & { score?: number }> = [...feed]
      .filter(f => f.action !== "ABSTAIN")
      .sort((a, b) => (b.p_conf ?? 0) - (a.p_conf ?? 0))
      .slice(0, 5)
      .map((f) => ({
        symbol: f.symbol,
        action: toRecAction(f.action),        // <-- tipado estricto (corrige TS2322)
        p_conf: f.p_conf,
        stops: f.stops ?? null,
        model_version: f.model_version,
        score: f.p_conf,
      }));
    return { user_id, items };
  }
}

/** Pings */
export async function pingFeed(): Promise<boolean> {
  try { return (await fetch(`${API_FEED}/v1/feed${qs({ horizon:"1d", min_conf:0.55 })}`, { cache: "no-store" })).ok; }
  catch { return false; }
}
export async function pingPaper(): Promise<boolean> {
  try { return (await fetch(`${API_PAPER}/v1/paper_trade/list${qs({ user:"demo", limit:1 })}`, { cache: "no-store" })).ok; }
  catch { return false; }
}

/** KPIs fallback (cliente) */
function computeKPIsFallback(trades: PaperTrade[]): PaperKPIs {
  const rows = [...(trades ?? [])].sort((a,b)=> new Date(a.ts).getTime() - new Date(b.ts).getTime());
  type Pos = { qty: number; avg_px: number };
  const posBySym: Record<string, Pos> = {};
  let realized = 0, closed = 0;
  const equity: number[] = []; let eq = 0;

  for (const t of rows) {
    const sym = t.symbol.toUpperCase();
    const px  = Number(t.effective_price ?? t.price ?? 0);
    const qtySigned = Number(t.qty ?? 0) * (t.side === "BUY" ? 1 : -1);
    const isBuy = qtySigned > 0;
    const cur = posBySym[sym] ?? { qty: 0, avg_px: 0 };

    if ((cur.qty >= 0 && isBuy) || (cur.qty <= 0 && !isBuy)) {
      const newQty = cur.qty + qtySigned;
      const totalCost = cur.avg_px * Math.abs(cur.qty) + px * Math.abs(qtySigned);
      cur.avg_px = newQty !== 0 ? totalCost / Math.abs(newQty) : 0;
      cur.qty = newQty;
      posBySym[sym] = cur;
    } else {
      const crossQty = Math.min(Math.abs(cur.qty), Math.abs(qtySigned)) * (qtySigned > 0 ? 1 : -1);
      realized += (px - cur.avg_px) * (-crossQty);
      eq += (px - cur.avg_px) * (-crossQty);
      equity.push(eq);
      const remaining = cur.qty + qtySigned;
      if (remaining === 0) { closed += 1; posBySym[sym] = { qty: 0, avg_px: 0 }; }
      else { posBySym[sym] = { qty: remaining, avg_px: cur.avg_px }; }
    }
  }

  let peak = -Infinity, mdd = 0;
  for (const x of equity) { if (x > peak) peak = x; const dd = peak - x; if (dd > mdd) mdd = dd; }

  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i-1], cur = equity[i];
    if (prev !== 0) rets.push((cur - prev) / Math.abs(prev));
  }
  const mean = rets.length ? rets.reduce((a,b)=>a+b,0) / rets.length : 0;
  const std  = rets.length ? Math.sqrt(rets.reduce((a,b)=>a+(b-mean)**2,0) / rets.length) : 0;
  const sharpe = std > 0 ? mean / std : 0;

  return {
    realized_pnl: Number(realized || 0),
    trades_closed: closed,
    max_drawdown: Number(mdd || 0),
    sharpe: Number(sharpe || 0),
    open_positions: Object.entries(posBySym)
      .filter(([,p]) => p.qty !== 0)
      .map(([symbol,p]) => ({ symbol, qty: p.qty, avg_effective_px: p.avg_px })),
    n_trades: rows.length,
  };
}

/** Export por defecto */
const api = {
  API_BASE, API_FEED, API_PAPER,
  qs, getJSON, postJSON,
  fetchFeed, fetchFeedSimple, fetchAssetDetail,
  fetchPaperSummary, fetchPaperTrades, postPaperTrade,
  login, getProfile, updateProfile,
  recommendByAsset, recommendByProfile,
  pingFeed, pingPaper,
};
export default api;
