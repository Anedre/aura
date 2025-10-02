import { apiFetch } from "./core/http";

/** Trade de paper trading: campos usados en /paper */
export type PaperTrade = {
  ts: string;                 // ISO timestamp
  symbol: string;             // "BTC-USD", "AAPL", ...
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  effective_price: number;    // precio tras fee/slippage (lo usa UI)
  fees_bp?: number;
  slippage_bp?: number;
  trade_id?: string | number;
  user?: string;
  [k: string]: unknown;
};

/** KPIs agregados que la UI muestra en /paper */
export type PaperKPIs = {
  realized_pnl: number;       // PnL neto (sólo cerrados) en moneda del activo/base
  trades_closed: number;      // operaciones cerradas (matches)
  max_drawdown: number;       // máximo retroceso de equity agregada
  sharpe: number;             // Sharpe aproximado por trade
  n_trades: number;           // número total de filas recibidas
  open_positions: Array<{ symbol: string; qty: number; avg_effective_px: number }>;
};

/** Lista de trades (autenticado) */
export async function listPaperTrades(limit = 20, user?: string): Promise<PaperTrade[]> {
  const u = user ? `&user=${encodeURIComponent(user)}` : "";
  return apiFetch<PaperTrade[]>(`/v1/paper_trade/list?limit=${limit}${u}`, { auth: true });
}

/** Crear un trade */
export type PaperTradeInput = {
  user: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  fees_bp?: number;
  slippage_bp?: number;
};

export async function placePaperTrade(payload: PaperTradeInput): Promise<PaperTrade> {
  return apiFetch<PaperTrade>(`/v1/paper_trade/place`, {
    method: "POST",
    auth: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** Intento preferido: endpoint de resumen; si no existe, calculamos KPIs a partir del listado */
export async function getPaperSummary(user: string, limit = 500): Promise<{ trades: PaperTrade[]; kpis: PaperKPIs }> {
  // 1) Si tu backend ya expone /v1/paper_trade/summary, úsalo.
  try {
    const out = await apiFetch<{ trades: PaperTrade[]; kpis: PaperKPIs }>(
      `/v1/paper_trade/summary?user=${encodeURIComponent(user)}&limit=${limit}`,
      { auth: true }
    );
    if (out?.trades && out?.kpis) return out;
  } catch { /* si 404/501/… caemos al fallback */ }

  // 2) Fallback: calculamos KPIs a partir de /list (cliente)
  const trades = await listPaperTrades(limit, user);
  const kpis = computeKPIs(trades);
  return { trades, kpis };
}

/** Agregador local de KPIs (si no hay summary en backend) */
function computeKPIs(rows: PaperTrade[]): PaperKPIs {
  const trades = [...rows].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  type Pos = { qty: number; avg_px: number };
  const pos: Record<string, Pos> = {};
  let equity = 0;
  const equitySeries: number[] = [];
  let closed = 0;

  for (const tr of trades) {
    const sym = tr.symbol.toUpperCase();
    const px = Number(tr.effective_price ?? tr.price ?? 0);
    const q = Number(tr.qty ?? 0) * (tr.side === "BUY" ? 1 : -1);
    const cur = pos[sym] ?? { qty: 0, avg_px: 0 };

    // mismo signo: promediamos
    if ((cur.qty >= 0 && q > 0) || (cur.qty <= 0 && q < 0)) {
      const newQty = cur.qty + q;
      const total = cur.avg_px * Math.abs(cur.qty) + px * Math.abs(q);
      pos[sym] = { qty: newQty, avg_px: newQty ? total / Math.abs(newQty) : 0 };
    } else {
      // cruce: cerramos contra posición existente
      const closeQty = Math.min(Math.abs(cur.qty), Math.abs(q));
      equity += (px - cur.avg_px) * (cur.qty > 0 ? closeQty : -closeQty);
      closed += closeQty > 0 ? 1 : 0;
      equitySeries.push(equity);
      const remaining = cur.qty + q;
      pos[sym] = remaining === 0 ? { qty: 0, avg_px: 0 } : { qty: remaining, avg_px: cur.avg_px };
    }
  }

  // drawdown y sharpe por trade (aprox, sobre equity incremental)
  let peak = 0, maxDD = 0;
  for (const v of equitySeries) { peak = Math.max(peak, v); maxDD = Math.max(maxDD, peak - v); }
  const diffs = equitySeries.map((v, i) => (i ? v - equitySeries[i - 1] : 0));
  const mean = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
  const var_ = diffs.length ? diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / diffs.length : 0;
  const sharpe = var_ > 0 ? mean / Math.sqrt(var_) : 0;

  const open_positions = Object.entries(pos)
    .filter(([, p]) => p.qty !== 0)
    .map(([symbol, p]) => ({ symbol, qty: p.qty, avg_effective_px: p.avg_px }));

  return {
    realized_pnl: equity,
    trades_closed: closed,
    max_drawdown: maxDD,
    sharpe: sharpe,
    n_trades: trades.length,
    open_positions,
  };
}
