// src/lib/api.profile.ts
// Endpoints de perfil de usuario y recomendaciones by-profile.

import { apiGet, apiPost } from "@/lib/api";

export type Objective = "ahorro" | "crecimiento" | "ingresos" | "mixto";
export type RiskLevel = "conservador" | "moderado" | "agresivo";

export interface UserProfile {
  user_id: string;
  objective?: Objective;
  risk?: RiskLevel;
  horizon_months?: number;
  capital?: number;
  constraints?: string[];
  [k: string]: unknown;
}

export type Action = "BUY" | "SELL" | "ABSTAIN" | "HOLD";

export interface ProfileRecoItem {
  symbol: string;
  action: Action;
  p_conf?: number | null;
  score?: number | null;
  [k: string]: unknown;
}

export interface ProfileRecoResponse {
  items: ProfileRecoItem[];
}

/** Leer perfil por user_id. */
export async function getProfile(user_id: string): Promise<UserProfile> {
  return apiGet<UserProfile>("/v1/profile", { user_id });
}

/** Actualizar perfil (upsert). */
export async function updateProfile(p: UserProfile): Promise<UserProfile> {
  return apiPost<UserProfile>("/v1/profile", p);
}

/** Top-N recomendaciones basadas en el perfil. */
export async function recommendByProfile(user_id: string, n = 5): Promise<ProfileRecoResponse> {
  return apiGet<ProfileRecoResponse>("/v1/recommend/profile", { user_id, n });
}
