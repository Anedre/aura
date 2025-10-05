// src/lib/api.ts
import { getSession, getAuthHeader, clearSessionCache } from "@/lib/auth";

export const API_BASE: string = (() => {
  const v = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (!v) {
    console.warn(
      "[AURA] NEXT_PUBLIC_API_BASE no está definido. Las llamadas a la API fallarán.",
    );
    return "";
  }
  return v.replace(/\/+$/, "");
})();

export class ApiError<T = unknown> extends Error {
  status: number;
  body: T | string | null;
  url: string;
  constructor(msg: string, status: number, url: string, body: T | string | null) {
    super(msg);
    this.name = "ApiError";
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

type Query =
  | URLSearchParams
  | string
  | Record<string, string | number | boolean | null | undefined>;

export function qs(q?: Query): string {
  if (!q) return "";
  if (typeof q === "string") return q.startsWith("?") ? q : `?${q}`;
  if (q instanceof URLSearchParams) return `?${q.toString()}`;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v == null) continue;
    p.set(k, String(v));
  }
  return `?${p.toString()}`;
}

function joinUrl(path: string, q?: Query): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}${qs(q)}`;
}

async function parseBody(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      return (await res.json()) as unknown;
    } catch {
      return null;
    }
  }
  try {
    return (await res.text()) as unknown;
  } catch {
    return null;
  }
}

type RequestOpts = {
  params?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  retry401?: boolean;
};

async function doFetch<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  { params, body, headers, signal, timeoutMs = 30000, retry401 = true }: RequestOpts = {},
): Promise<T> {
  const url = joinUrl(path, params);

  let sess = await getSession();
  let auth = getAuthHeader(sess);

  const ctr = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timer = timeoutMs ? setTimeout(() => ctr?.abort(), timeoutMs) : undefined;

  const init = (overrideAuth?: Record<string, string>): RequestInit => ({
    method,
    headers: {
      "Content-Type": "application/json",
      ...auth,
      ...(overrideAuth ?? {}),
      ...(headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "omit",
    signal: ctr?.signal ?? signal,
  });

  try {
    let res = await fetch(url, init());
    if (res.status === 401 && retry401) {
      clearSessionCache();
      sess = await getSession();
      auth = getAuthHeader(sess);
      res = await fetch(url, init(auth));
    }

    const data = await parseBody(res);

    if (!res.ok) {
      const message =
        typeof data === "string"
          ? data
          : (data as { message?: string })?.message ?? `API ${method} ${url} → ${res.status}`;
      throw new ApiError(message, res.status, url, data);
    }

    return data as T;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    const msg =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Error de red";
    throw new ApiError(msg, 0, url, null);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function apiGet<T>(path: string, params?: Query, opts?: Omit<RequestOpts, "params">) {
  return doFetch<T>("GET", path, { ...(opts || {}), params });
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  opts?: Omit<RequestOpts, "body"> & { params?: Query },
) {
  return doFetch<T>("POST", path, { ...(opts || {}), body });
}

export async function apiPut<T>(
  path: string,
  body?: unknown,
  opts?: Omit<RequestOpts, "body"> & { params?: Query },
) {
  return doFetch<T>("PUT", path, { ...(opts || {}), body });
}

export async function apiDelete<T>(
  path: string,
  params?: Query,
  opts?: Omit<RequestOpts, "params">,
) {
  return doFetch<T>("DELETE", path, { ...(opts || {}), params });
}

/** Ping de salud simple (útil para dashboards). */
export async function getHealth(): Promise<unknown> {
  try {
    return await apiGet<unknown>("/v1/health");
  } catch {
    return apiGet<unknown>("/v1/paper_trade/health");
  }
}

// Compat para AppBoot
export async function pingFeed(): Promise<boolean> {
  try {
    await apiGet<unknown>("/v1/feed", { horizon: "1d", min_conf: 0 });
    return true;
  } catch {
    try {
      await apiGet<unknown>("/v1/feed");
      return true;
    } catch {
      return false;
    }
  }
}
export async function pingPaper(): Promise<boolean> {
  try {
    await apiGet<unknown>("/v1/paper_trade/health");
    return true;
  } catch {
    try {
      const s = await getSession();
      const user = s?.user_id ?? "demo";
      await apiGet<unknown>("/v1/paper_trade/summary", { user, limit: 1 });
      return true;
    } catch {
      return false;
    }
  }
}
