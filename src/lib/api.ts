// src/lib/api.ts
// Barrel sin side-effects. No metas lógica aquí.

// === Núcleo (HTTP + ENV) ===
export * from "./core/env";
export { apiFetch } from "./core/http";
export type { ApiOptions, ApiError } from "./core/http";

// === Feed / Asset ===
export { getFeed, getAsset, recommendByAsset } from "./api.feed";
export type { FeedItem, Horizon, AssetRecommendation } from "./api.feed";

// === Paper trading ===
export { listPaperTrades, placePaperTrade, getPaperSummary } from "./api.paper";
export type { PaperTrade, PaperTradeInput, PaperKPIs } from "./api.paper";

// === Perfil ===
export { getProfile, updateProfile, recommendByProfile } from "./api.profile";
export type { UserProfile } from "./api.profile";

// === Health (usado por AppBoot) ===
export { pingFeed, pingPaper } from "./api.health";

// === Auth ===
export {
  login,
  logout,
  signup,
  confirmSignup,
  resendConfirmation,
  getSession,
  setSession,
  clearSession,
  SESSION_KEY,
} from "./auth";

// === Aliases de compatibilidad (para no tocar tus vistas actuales) ===
export { getFeed as fetchFeed } from "./api.feed";
export { getAsset as fetchAssetDetail } from "./api.feed";
export { placePaperTrade as postPaperTrade } from "./api.paper";
export { getPaperSummary as fetchPaperSummary } from "./api.paper";
