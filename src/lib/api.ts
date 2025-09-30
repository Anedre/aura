// src/lib/api.ts
type Action = "BUY" | "SELL" | "ABSTAIN" | "HOLD";

/* =========================
 * Config & helpers HTTP
 * =======================*/
// --- Config & helpers HTTP (REEMPLAZO) ---
const RAW_BASE = (process.env.NEXT_PUBLIC_AURA_API ?? process.env.NEXT_PUBLIC_API_BASE ?? '')
  .trim()
  .replace(/\/$/, ''); // sin slash final

const isBrowser = typeof window !== 'undefined';
const USE_PROXY = (process.env.NEXT_PUBLIC_AURA_PROXY ?? '0') === '1';

// Navegador: si hay base explícita y NO usamos proxy → URL absoluta (evita 404/CORS en Amplify).
// Con proxy (rewrites) → relativo. En servidor usamos base si existe.
const API_BASE = (!USE_PROXY && RAW_BASE) ? RAW_BASE : (isBrowser ? '' : RAW_BASE);

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

class HttpError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`; // usa absoluta si corresponde
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : (undefined as unknown);
  if (!res.ok) {
    throw new HttpError(`HTTP ${res.status} ${res.statusText} @ ${url}`, res.status, data);
  }
  return data as T;
}

if (isBrowser) {
  console.info('[AURA] API_BASE (browser) =', API_BASE || '(relative via rewrites)');
} else {
  console.info('[AURA] API_BASE (server) =', API_BASE || '(relative)');
}


/* =========================
 * Tipos compartidos
 * =======================*/
export type Horizon = "1d" | "1w" | "4h" | "1h";

export type Ohlcv = { t: string; o: number; h: number; l: number; c: number; v?: number };
export type Signal = {
  ts: string;
  action: Action;
  p_conf?: number;
  sigma?: number;
  band_low?: number;
  band_high?: number;
};
export type Stops = { tp: number; sl: number };

export type AssetDetail = {
  symbol: string;
  horizon?: Horizon;
  ohlcv?: Ohlcv[];
  signals?: Signal[];
  stops?: Stops | null;
  last_close?: number | null;
};

export type AssetRecommendation = {
  action: "BUY" | "SELL" | "ABSTAIN";
  p_conf?: number;
  stops?: Stops | null;
};

export type PaperTrade = {
  ts: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  effective_price: number;
  fees_bp: number;
  slippage_bp: number;
  trade_id: string;
  user: string;
};

export type PaperKPIs = {
  realized_pnl: number;
  trades_closed: number;
  max_drawdown: number;
  sharpe: number;
  n_trades: number;
  open_positions: Array<{ symbol: string; qty: number; avg_effective_px: number }>;
};

export type PaperSummary = { trades: PaperTrade[]; kpis: PaperKPIs };

export async function fetchPaperSummary(user: string, limit = 500): Promise<PaperSummary> {
  const q = qs({ user, limit });

  // Llamamos a tu endpoint real:
  const raw = await fetchJson<unknown>(`/v1/paper_trade/list${q}`);

  // Helpers locales para castear sin any
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? (n as number) : undefined;
  };
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const sideOf = (v: unknown): "BUY" | "SELL" | undefined =>
    v === "BUY" || v === "SELL" ? v : undefined;

  const toTrades = (arr: unknown[]): PaperTrade[] =>
    arr
      .map((x) => {
        if (!x || typeof x !== "object") return null;
        const o = x as Record<string, unknown>;
        const symbol = str(o.symbol) ?? "";
        const side = sideOf(o.side);
        const qty = num(o.qty);
        const price = num(o.price) ?? 0;
        const effective_price = num(o.effective_price) ?? price;
        const ts = str(o.ts) ?? new Date().toISOString();
        const trade_id = str(o.trade_id) ?? str(o.id) ?? `${symbol}-${ts}`;
        if (!symbol || !side || !qty) return null;
        return {
          ts,
          symbol,
          side,
          qty,
          price,
          effective_price,
          fees_bp: num(o.fees_bp) ?? 0,
          slippage_bp: num(o.slippage_bp) ?? 0,
          trade_id,
          user: str(o.user) ?? user,
        };
      })
      .filter((t): t is PaperTrade => t !== null);

  let trades: PaperTrade[] = [];
  if (Array.isArray(raw)) {
    trades = toTrades(raw);
  } else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.trades)) trades = toTrades(o.trades as unknown[]);
    else if (Array.isArray(o.items)) trades = toTrades(o.items as unknown[]);
  }

  // KPIs defensivos (si tu backend no los envía)
  const kpis: PaperKPIs = {
    realized_pnl: 0,
    trades_closed: trades.length,
    max_drawdown: 0,
    sharpe: 0,
    n_trades: trades.length,
    open_positions: [],
  };

  return { trades, kpis };
}

/** Ítems del feed para /app/feed */
export type FeedItem = {
  symbol: string;
  action: Action;
  ts?: string;                 // ISO
  p_conf?: number;             // [0..1]
  sigma?: number;              // incertidumbre relativa
  sigma_limit?: number;        // umbral σ_max que disparó abstención (opcional)
  abstain_reason?: string;     // motivo textual de abstención (opcional)
  last_close?: number;
  stops?: Stops | null;
  horizon?: Horizon;
  model_version?: string;      // versión del modelo (opcional)
};

// --- Perfil (tipos) ---
export type Objective = "ahorro" | "crecimiento" | "ingresos" | "mixto";
export type Risk = "conservador" | "moderado" | "agresivo";

export type UserProfile = {
  user_id?: string;
  objective?: Objective;
  risk?: Risk;
  horizon_months?: number;
  capital?: number;
  constraints?: string[]; // símbolos/categorías a excluir
};

/* -------------------------
 * Utils de normalización
 * -----------------------*/
function toNumber(x: unknown): number | undefined {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}
function asAction(x: unknown): Action {
  return x === "BUY" || x === "SELL" || x === "ABSTAIN" || x === "HOLD" ? x : "ABSTAIN";
}
function asFeedArray(x: unknown): unknown[] {
  if (Array.isArray(x)) return x;
  if (x && typeof x === "object") {
    const maybe = (x as { items?: unknown }).items;
    if (Array.isArray(maybe)) return maybe;
  }
  return [];
}
// Helpers de lectura segura (sin any)
type Dict = Record<string, unknown>;
const getNum = (o: Dict, k: string): number | undefined => {
  const v = o[k];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? (n as number) : undefined;
};
const getStr = (o: Dict, k: string): string | undefined =>
  typeof o[k] === "string" ? (o[k] as string) : undefined;

/* =========================
 * Feed / Asset
 * =======================*/

export async function fetchFeed(params?: {
  horizon?: Horizon;
  min_conf?: number;
  limit?: number;
}): Promise<FeedItem[]> {
  const q = qs({
    horizon: params?.horizon ?? "1d",
    min_conf: params?.min_conf ?? undefined,
    limit: params?.limit ?? undefined,
  });
  const raw = await fetchJson<unknown>(`/v1/feed${q}`);
  const arr = asFeedArray(raw);

  const items: FeedItem[] = arr
    .map((r): FeedItem | null => {
      if (!r || typeof r !== "object") return null;
      const obj = r as Dict;
      const symbol = String(obj.symbol ?? obj.ticker ?? "");
      if (!symbol) return null;

      const action = asAction(obj.action);
      const ts = typeof obj.ts === "string" ? obj.ts : undefined;
      const p_conf = toNumber(obj.p_conf);
      const sigma = toNumber(obj.sigma);
      const sigma_limit = getNum(obj, "sigma_limit");

      const abstain_reason = getStr(obj, "abstain_reason");

      const last_close = toNumber(obj.last_close);
      const stops: Stops | null =
        obj.stops && typeof obj.stops === "object"
          ? {
              tp: toNumber((obj.stops as Record<string, unknown>).tp) ?? 0,
              sl: toNumber((obj.stops as Record<string, unknown>).sl) ?? 0,
            }
          : null;

      const hzRaw = typeof obj.horizon === "string" ? (obj.horizon as string) : undefined;
      const horizon: Horizon | undefined =
        hzRaw === "1d" || hzRaw === "1w" || hzRaw === "4h" || hzRaw === "1h" ? hzRaw : undefined;

      const model_version = getStr(obj, "model_version");


      return { symbol, action, ts, p_conf, sigma, sigma_limit, abstain_reason, last_close, stops, horizon, model_version };
    })
    .filter((x): x is FeedItem => x !== null);

  return items;
}

export async function fetchAssetDetail(symbol: string, windowBars = 120): Promise<AssetDetail> {
  const q = qs({ window: windowBars });
  return fetchJson<AssetDetail>(`/v1/asset/${encodeURIComponent(symbol)}/detail${q}`);
}

export async function recommendByAsset(symbol: string): Promise<AssetRecommendation> {
  try {
    const q = qs({ symbol });
    return await fetchJson<AssetRecommendation>(`/v1/recommend/asset${q}`);
  } catch {
    try {
      const feed = await fetchFeed({ horizon: "1d", limit: 200 });
      const row = feed.find((r) => r.symbol.toUpperCase() === symbol.toUpperCase());
      if (row) {
        return { action: row.action === "HOLD" ? "ABSTAIN" : row.action, p_conf: row.p_conf, stops: row.stops ?? null };
      }
    } catch { /* ignore */ }
    return { action: "ABSTAIN", p_conf: 0, stops: null };
  }
}

/* =========================
 * Paper trading
 * =======================*/
export async function postPaperTrade(input: {
  user: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  fees_bp?: number;
  slippage_bp?: number;
}): Promise<PaperTrade> {
  // Tu API real: POST /v1/paper_trade/post
  return fetchJson<PaperTrade>(`/v1/paper_trade/post`, {
    method: "POST",
    body: JSON.stringify({
      user: input.user,
      symbol: input.symbol,
      side: input.side,
      qty: input.qty,
      price: input.price,
      fees_bp: input.fees_bp ?? 0,
      slippage_bp: input.slippage_bp ?? 0,
    }),
  });
}
/* =========================
 * Health checks (AppBoot)
 * =======================*/
export async function pingFeed(): Promise<boolean> {
  try {
    await fetchFeed({ horizon: "1d", limit: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function pingPaper(): Promise<boolean> {
  try {
    await fetchPaperSummary("demo", 1);
    return true;
  } catch {
    return false;
  }
}
/* =========================
 * Auth (Login)
 * =======================*/
export type Session = { user_id: string; token: string; email: string; name?: string };
type SessionRaw = { token: string; email: string; name?: string; user_id?: string };

export async function login(email: string, password: string): Promise<Session> {
  const s = await fetchJson<SessionRaw>(`/v1/login`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!s?.token || !s?.email) {
    throw new Error("Respuesta de login inválida.");
  }
  const user_id = s.user_id ?? s.email; // fallback si el backend no envía user_id
  return { user_id, token: s.token, email: s.email, name: s.name };
}
// --- Perfil (endpoints) ---
// === PERFIL (endpoints) ===
export async function getProfile(user_id?: string): Promise<UserProfile | null> {
  try {
    if (user_id) {
      const q = new URLSearchParams({ user: user_id }).toString();
      return await fetchJson<UserProfile>(`/v1/profile?${q}`);
    }
    const me = await fetchJson<Partial<UserProfile> & { email?: string }>(`/v1/me`);
    return {
      user_id: me.user_id ?? me.email,
      objective: me.objective,
      risk: me.risk,
      horizon_months: me.horizon_months,
      capital: me.capital,
      constraints: Array.isArray(me.constraints) ? me.constraints : [],
    };
  } catch {
    return null;
  }
}

export async function updateProfile(p: UserProfile): Promise<UserProfile> {
  const qs = p.user_id ? `?${new URLSearchParams({ user: p.user_id }).toString()}` : "";
  return fetchJson<UserProfile>(`/v1/profile${qs}`, {
    method: "PATCH",
    body: JSON.stringify(p),
  });
}

export type ProfileReco = {
  items: Array<{ symbol: string; action: "BUY" | "SELL" | "ABSTAIN"; p_conf?: number; score?: number }>;
};

export async function recommendByProfile(user_id: string): Promise<ProfileReco> {
  // 1) Endpoint dedicado
  try {
    const q = new URLSearchParams({ user: user_id, limit: "5" }).toString();
    const r = await fetchJson<ProfileReco>(`/v1/recommend/profile?${q}`);
    if (Array.isArray(r.items)) return r;
  } catch { /* ignore */ }

  // 2) Fallback: top-5 por p_conf del feed 1d (sanitizando HOLD -> ABSTAIN)
  try {
    const feed = await fetchFeed({ horizon: "1d", limit: 500 });
    const items = feed
      .filter(x => x.action === "BUY" || x.action === "SELL")
      .sort((a, b) => (b.p_conf ?? 0) - (a.p_conf ?? 0))
      .slice(0, 5)
      .map(x => ({
        symbol: x.symbol,
        action: x.action === "HOLD" ? "ABSTAIN" : x.action, // <- FIX clave
        p_conf: x.p_conf,
        score: x.p_conf,
      }));
    return { items };
  } catch {
    return { items: [] };
  }
}


