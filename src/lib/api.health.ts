// src/lib/api.health.ts
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/+$/, "");

async function probe(path: string): Promise<boolean> {
  if (!API_BASE) return false;
  const url = `${API_BASE}${path}`;
  try {
    const h = await fetch(url, { method: "HEAD", mode: "cors", cache: "no-store" });
    if (h.ok) return true;
  } catch {}
  try {
    const g = await fetch(url, { method: "GET", mode: "cors", cache: "no-store" });
    return g.ok;
  } catch { return false; }
}

export async function checkHealth(): Promise<{ feed: boolean; paper: boolean }> {
  const [feed, paper] = await Promise.all([probe("/v1/feed"), probe("/v1/paper_trade")]);
  return { feed, paper };
}
