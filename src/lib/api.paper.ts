// src/lib/api.paper.ts
// Endpoints de Paper Trading (resumen, lista, crear orden).
// Reutiliza apiGet/apiPost que ya inyectan el JWT de Cognito.

import { apiGet, apiPost } from "@/lib/api";

export type Side = "BUY" | "SELL";

export interface PaperTrade {
  ts: string;                 // ISO UTC
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  effective_price: number;
  fees_bp?: number;
  slippage_bp?: number;
  trade_id: string;
  user: string;
  [k: string]: unknown;
}

export interface OpenPosition {
  symbol: string;
  qty: number;                // cantidad neta
  avg_effective_px: number;   // precio medio con fees+slip
}

export interface PaperKPIs {
  realized_pnl: number;
  trades_closed: number;
  max_drawdown: number;
  sharpe: number;
  n_trades: number;
  open_positions: OpenPosition[];
}

export interface PaperSummary {
  trades: PaperTrade[];
  kpis: PaperKPIs;
}

/** Resumen de paper trading (trades + KPIs). */
export async function getPaperSummary(user: string, limit = 500): Promise<PaperSummary> {
  // Ajusta el path si tu backend usa otro (ej. /v1/paper/summary)
  // El wrapper apiGet serializa los params.
  return apiGet<PaperSummary>("/v1/paper_trade/summary", { user, limit });
}
// alias de compatibilidad con imports antiguos
export const fetchPaperSummary = getPaperSummary;

/** Crear una orden de paper-trade. */
export interface PaperOrderRequest {
  user: string;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  fees_bp?: number;       // bps
  slippage_bp?: number;   // bps
  [k: string]: unknown;
}

export async function submitPaperOrder(body: PaperOrderRequest): Promise<PaperTrade> {
  // Si tu backend espera otras claves (fees_bps/slippage_bps), mapea aquí:
  const payload = {
    ...body,
    fees_bps: body.fees_bp,
    slippage_bps: body.slippage_bp,
  };
  return apiPost<PaperTrade>("/v1/paper_trade/order", payload);
}
// alias de compatibilidad
export const postPaperTrade = submitPaperOrder;
