import type { FeedItem } from "@/lib/api.feed";

function periodsPerYear(h?: string): number {
  if (!h) return 12;
  const lower = h.toLowerCase();
  if (lower.endsWith("d")) {
    const days = Number(lower.replace("d", ""));
    if (Number.isFinite(days) && days > 0) {
      return Math.max(1, Math.round(252 / days));
    }
  }
  if (lower === "1w") return 52;
  if (lower === "1h") return 252 * 6;
  if (lower.endsWith("m")) {
    const minutes = Number(lower.replace("m", ""));
    return minutes > 0 ? (12 * 60) / minutes : 12;
  }
  return 12;
}

function annualizeReturn(mu: number, periods: number) {
  return Math.pow(1 + mu, Math.max(1, periods)) - 1;
}

function annualizeVolatility(sig: number, periods: number) {
  return sig * Math.sqrt(Math.max(1, periods));
}

export function deriveFromFeed(item: FeedItem): { muA: number; sigA: number } | null {
  const confidence = typeof item.p_conf === "number" ? Math.max(0, Math.min(1, item.p_conf)) : 0.5;
  const periods = periodsPerYear(item.horizon as string | undefined);
  const lastClose = item.last_close ?? null;
  let mu = 0;
  let sigma: number | null = null;

  if (typeof item.sigma === "number" && Number.isFinite(item.sigma)) {
    sigma = Math.max(0, item.sigma);
  }

  if (lastClose && item.stops && typeof item.stops.tp === "number" && typeof item.stops.sl === "number") {
    const tpDistance = item.stops.tp / lastClose - 1;
    const slDistance = item.stops.sl / lastClose - 1;
    if (item.action === "BUY") {
      mu = confidence * tpDistance + (1 - confidence) * slDistance;
    } else if (item.action === "SELL") {
      mu = confidence * (-Math.abs(slDistance)) + (1 - confidence) * Math.abs(tpDistance);
    } else {
      mu = confidence * tpDistance + (1 - confidence) * slDistance;
    }
    if (sigma == null) {
      sigma = (Math.abs(tpDistance) + Math.abs(slDistance)) / 2;
    }
  } else {
    const base = 0.01;
    if (item.action === "BUY") mu = confidence * base;
    else if (item.action === "SELL") mu = -confidence * base;
    else mu = 0;
    if (sigma == null) sigma = 0.02;
  }

  return { muA: annualizeReturn(mu, periods), sigA: annualizeVolatility(sigma ?? 0.02, periods) };
}

