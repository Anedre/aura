// src/lib/api.ts
import { getAuthHeader, clearSessionCache } from "@/lib/auth";

/**
 * Base URL de la API AURA.
 * Debe terminar sin '/' y sin incluir /v1.
 */
export const API_BASE: string = (() => {
  const v = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (!v) console.warn("[AURA/API] NEXT_PUBLIC_API_BASE no definido");
  return v || "";
})();

/**
 * Construye headers base para llamadas API, incluyendo Authorization.
 */
async function baseHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const auth = await getAuthHeader();
  return {
    "Content-Type": "application/json",
    ...auth,
    ...(extra ?? {}),
  };
}

/**
 * GET genérico.
 */
export async function apiGet<T = unknown>(
  path: string,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const headers = await baseHeaders(extraHeaders);
  const r = await fetch(`${API_BASE}${path}`, { method: "GET", headers, mode: "cors" });

  if (r.status === 401) {
    clearSessionCache();
    throw new Error("Sesión expirada");
  }
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

/**
 * POST genérico.
 */
export async function apiPost<T = unknown, B extends object = Record<string, unknown>>(
  path: string,
  body?: B,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const headers = await baseHeaders(extraHeaders);
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
    mode: "cors",
  });

  if (r.status === 401) {
    clearSessionCache();
    throw new Error("Sesión expirada");
  }
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

/**
 * DELETE genérico.
 */
export async function apiDelete<T = unknown>(
  path: string,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const headers = await baseHeaders(extraHeaders);
  const r = await fetch(`${API_BASE}${path}`, { method: "DELETE", headers, mode: "cors" });

  if (r.status === 401) {
    clearSessionCache();
    throw new Error("Sesión expirada");
  }
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}
