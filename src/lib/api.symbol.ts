// src/lib/api.symbol.ts
// API de vistas de símbolo: detalle OHLCV, recomendación por activo y orden de paper-trade.

import { apiGet, apiPost } from "@/lib/api";

/* ----------------------------- Tipos locales ----------------------------- */

export type Side = "BUY" | "SELL";

export interface PaperTrade {
  orderId: string;
  status?: "accepted" | "rejected";
  symbol: string;
  side: Side;
  qty?: number;
  price?: number;
  ts?: string;
  [k: string]: unknown;
}

export interface AssetRecommendation {
  symbol: string;
  action?: "BUY" | "SELL" | "HOLD" | "ABSTAIN";
  p_conf?: number;
  sigma?: number;
  horizon?: string;
  model_version?: string;
  stops?: { tp: number; sl: number } | null;
  [k: string]: unknown;
}

export interface OhlcvRow {
  t: number | string; // a veces ISO string
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface SignalPoint {
  ts: string;
  action: "BUY" | "SELL" | "ABSTAIN" | "HOLD";
  p_conf?: number;
  sigma?: number;
  band_low?: number;
  band_high?: number;
}

export interface AssetDetail {
  symbol: string;
  horizon?: string;
  ohlcv?: OhlcvRow[];
  signals?: SignalPoint[];
  stops?: { tp: number; sl: number } | null;
  last_close?: number | null;
  [k: string]: unknown;
}

/* -------------------------------- Endpoints ------------------------------- */

/** Detalle OHLCV + señales del activo. */
export async function getAssetDetail(symbol: string, window = 120): Promise<AssetDetail> {
  const s = encodeURIComponent(symbol);
  return apiGet<AssetDetail>(`/v1/asset/${s}/detail`, { window });
}
// Alias de compatibilidad con imports antiguos
export const fetchAssetDetail = getAssetDetail;

/** Recomendación por activo (algunos backends devuelven array, otros objeto). */
export async function recommendByAsset(
  symbol: string,
): Promise<AssetRecommendation[] | AssetRecommendation> {
  return apiGet<AssetRecommendation[] | AssetRecommendation>("/v1/recommend/asset", { symbol });
}

/** Enviar orden al simulador de paper-trade. */
export interface PaperOrderRequest {
  symbol: string;
  side: Side;
  qty?: number;
  price?: number;
  // Si tu backend soporta costos/deslizamiento:
  fees_bps?: number;
  slippage_bps?: number;
  [k: string]: unknown;
}

export async function submitPaperOrder(body: PaperOrderRequest): Promise<PaperTrade> {
  return apiPost<PaperTrade>("/v1/paper_trade/order", body);
}
// Alias de compatibilidad
export const postPaperTrade = submitPaperOrder;
