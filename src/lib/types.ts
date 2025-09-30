export type Action = "BUY" | "SELL" | "ABSTAIN";

export interface AssetRecommendation {
  symbol: string;
  action: Action;
  p_conf?: number | null;
  stops?: { tp: number; sl: number } | null;
  model_version?: string;
  score?: number | null;
}

export interface FeedItem {
  symbol: string;
  action: Action;
  p_conf?: number | null;
  score?: number | null;
  model_version?: string;
}

export interface QuotePoint { t: number; p: number; }     // serie línea
export interface Candle { t: number; o: number; h: number; l: number; c: number; v?: number; }

export interface UserProfile {
  user_id: string;
  objective: "ahorro" | "crecimiento" | "ingresos" | "mixto";
  risk: "conservador" | "moderado" | "agresivo";
  horizon_months: number;
  capital: number;
  constraints: string[];
}
