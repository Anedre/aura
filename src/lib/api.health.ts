import { apiFetch } from "./core/http";

/** Ping al feed. Si responde (código 2xx), devuelve true; ante 4xx/5xx -> false */
export async function pingFeed(): Promise<boolean> {
  try {
    await apiFetch<void>("/v1/feed", { method: "HEAD" });
    return true;
  } catch {
    return false;
  }
}

/** Ping a paper-trade health (ideal: endpoint público). Si falla -> false */
export async function pingPaper(): Promise<boolean> {
  try {
    await apiFetch<void>("/v1/paper_trade/health");
    return true;
  } catch {
    return false;
  }
}
