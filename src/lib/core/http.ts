import { API_BASE } from "./env";
import { getSession } from "@/lib/auth";

export type ApiOptions = RequestInit & {
  /** Adjunta Authorization Bearer si hay sesión */
  auth?: boolean;
  /** Si true, no lanza en 4xx/5xx; devuelve un objeto con ok=false */
  soft?: boolean;
};

export type ApiError = Error & { status?: number; body?: unknown };

export async function apiFetch<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const headers = new Headers(opts.headers || {});
  if (opts.auth) {
    const s = await Promise.resolve(getSession());
    const token = s?.idToken || s?.accessToken || s?.token || s?.jwt;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, { ...opts, headers, cache: "no-store" });

  if (opts.soft && !res.ok) {
    return { ok: false, status: res.status, statusText: res.statusText } as unknown as T;
  }

  if (!res.ok) {
    const err: ApiError = new Error(`${res.status} ${res.statusText}`);
    err.status = res.status;
    try { err.body = await res.json(); } catch {}
    throw err;
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json() as Promise<T>;
  return (await res.text()) as unknown as T;
}
