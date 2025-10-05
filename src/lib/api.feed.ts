// src/lib/api.feed.ts
// API del Feed: tipos estrictos + fetch tipado. Reutiliza apiGet() que ya agrega Authorization.

import { apiGet } from "@/lib/api";

export type Action = "BUY" | "SELL" | "HOLD" | "ABSTAIN";
export type Horizon = "1d" | "1w" | "1h" | "15m" | string;

export interface Stops {
  tp: number;
  sl: number;
}

export interface FeedItem {
  symbol: string;
  action: Action;
  p_conf?: number;                 // 0..1
  sigma?: number;
  sigma_limit?: number | null;
  horizon?: Horizon;
  ts?: string;                     // ISO
  last_close?: number;
  model_version?: string;
  abstain_reason?: string | null;
  stops?: Stops | null;            // ⬅️ TIPO FUERTE (no {} ni unknown)
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
  return apiGet<FeedItem[]>(`/v1/feed${query}`);
}

// alias de compatibilidad si tenías imports antiguos
export const fetchFeed = getFeed;
