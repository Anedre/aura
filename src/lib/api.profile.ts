import { apiFetch } from "./core/http";
import { getFeed, type FeedItem } from "./api.feed";

export type UserProfile = {
  user_id: string;
  objective?: "ahorro" | "crecimiento" | "ingresos" | "mixto";
  risk?: "conservador" | "moderado" | "agresivo";
  horizon_months?: number;
  capital?: number;
  constraints?: string[]; // símbolos a excluir, etc.
};

/** GET /v1/profile/{user_id} (autenticado) */
export async function getProfile(user_id: string): Promise<UserProfile> {
  return apiFetch<UserProfile>(`/v1/profile/${encodeURIComponent(user_id)}`, { auth: true });
}

/** PUT /v1/profile/{user_id} (autenticado) */
export async function updateProfile(p: UserProfile): Promise<UserProfile> {
  return apiFetch<UserProfile>(`/v1/profile/${encodeURIComponent(p.user_id)}`, {
    method: "PUT",
    auth: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(p),
  });
}

/** GET /v1/recommend/profile?user_id=... — si no existe, fallback al feed */
export async function recommendByProfile(user_id: string): Promise<{ items: Array<{ symbol: string; action: FeedItem["action"]; p_conf?: number }> }> {
  // 1) intento endpoint dedicado
  try {
    return await apiFetch<{ items: Array<{ symbol: string; action: FeedItem["action"]; p_conf?: number }> }>(
      `/v1/recommend/profile?user_id=${encodeURIComponent(user_id)}`,
      { auth: true }
    );
  } catch {
    // 2) Fallback: top-5 del feed por p_conf (filtrando constraints si el perfil las traía)
    let constraints: string[] = [];
    try {
      const p = await getProfile(user_id);
      constraints = (p.constraints ?? []).map(s => s.toUpperCase());
    } catch {}
    const all = await getFeed({ horizon: "1d", min_conf: 0.55 });
    const pool = all
      .filter(x => !constraints.includes(String(x.symbol).toUpperCase()))
      .sort((a, b) => (b.p_conf ?? 0) - (a.p_conf ?? 0))
      .slice(0, 5);
    return {
      items: pool.map(x => ({ symbol: x.symbol, action: x.action, p_conf: x.p_conf ?? undefined })),
    };
  }
}

