// src/lib/api.predict.ts
import { apiPost, API_BASE } from "@/lib/api";
import type { RiskProfile } from "@/lib/invest";

export type Action = "BUY" | "SELL" | "HOLD" | "ABSTAIN";

export type PredictionRequest = {
  symbol: string;
  amount?: number;
  currency?: "USD" | "PEN" | string;
  horizon?: string; // e.g., "1d" | "1w"
  risk_profile?: RiskProfile | string;
  exec_date?: string; // YYYY-MM-DD
};

export type Stops = { tp: number; sl: number } | null;

export type PredictionResult = {
  symbol: string;
  action: Action;
  p_conf?: number; // 0..1
  sigma?: number;
  horizon?: string;
  ts?: string; // ISO
  last_close?: number;
  model_version?: string;
  abstain_reason?: string | null;
  stops?: Stops;
  rationale?: string;
  [k: string]: unknown;
};

function parseStops(x: unknown): Stops {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  const tp = typeof o.tp === "number" ? o.tp : Number.NaN;
  const sl = typeof o.sl === "number" ? o.sl : Number.NaN;
  if (Number.isNaN(tp) || Number.isNaN(sl)) return null;
  return { tp, sl };
}

function parseAction(x: unknown): Action {
  const s = String(x || "").toUpperCase();
  return (s === "BUY" || s === "SELL" || s === "HOLD" || s === "ABSTAIN") ? (s as Action) : "HOLD";
}

function hasResultField(obj: unknown): obj is { result: unknown } {
  return typeof obj === "object" && obj !== null && "result" in obj;
}

export function parsePrediction(x: unknown): PredictionResult {
  // Backend may return the payload directly or wrapped in { result: ... }
  const payload = hasResultField(x) ? x.result : x;
  const o = (typeof payload === "object" && payload) ? (payload as Record<string, unknown>) : {};
  return {
    // spread unknown extras first; sanitized fields override
    ...o,
    symbol: String(o.symbol ?? ""),
    action: parseAction(o.action),
    p_conf: typeof o.p_conf === "number" ? o.p_conf : undefined,
    sigma: typeof o.sigma === "number" ? o.sigma : undefined,
    horizon: typeof o.horizon === "string" ? o.horizon : undefined,
    ts: typeof o.ts === "string" ? o.ts : undefined,
    last_close: typeof o.last_close === "number" ? o.last_close : undefined,
    model_version: typeof o.model_version === "string" ? o.model_version : undefined,
    abstain_reason:
      typeof o.abstain_reason === "string"
        ? o.abstain_reason
        : (o.abstain_reason == null ? null : undefined),
    stops: parseStops(o.stops),
    rationale: typeof o.rationale === "string" ? o.rationale : undefined,
  } satisfies PredictionResult;
}

/** Path configurado para predicción personalizada. Default: /v1/predict */
export const PREDICT_PATH: string = (() => {
  const p = (process.env.NEXT_PUBLIC_PREDICT_PATH || "/v1/predict").trim();
  return p.startsWith("/") ? p : `/${p}`;
})();

/** Envía una solicitud de predicción personalizada a la API. */
export async function requestPrediction(req: PredictionRequest): Promise<PredictionResult> {
  if (!API_BASE) throw new Error("API_BASE no configurado (NEXT_PUBLIC_API_BASE)");

  // Limpia body: solo incluye campos definidos
  const body: Record<string, unknown> = {};
  body.symbol = req.symbol;
  if (req.amount != null) body.amount = req.amount;
  if (req.currency) body.currency = req.currency;
  if (req.horizon) body.horizon = req.horizon;
  if (req.risk_profile) body.risk_profile = req.risk_profile;
  if (req.exec_date) body.exec_date = req.exec_date;

  const raw = await apiPost<unknown, typeof body>(PREDICT_PATH, body);
  return parsePrediction(raw);
}
