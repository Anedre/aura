// src/lib/auth.ts
export type Session = { user_id: string; email: string; token: string };

const KEY = "aura:session";

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(s: Session) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export function clearSession() {
  try { localStorage.removeItem(KEY); } catch {}
}

// helper para obtener user_id “razonable” cuando aún no hay login
export function getUserIdOr(emailFallback = "demo@local"): string {
  const s = getSession();
  return s?.user_id ?? emailFallback;
}

// src/lib/auth.ts (cliente)
export function getIdToken(): string | null {
  try {
    return document.cookie.split("; ").find(x=>x.startsWith((process.env.NEXT_PUBLIC_COOKIE_NAME_PREFIX ?? "aura")+"_id="))?.split("=")[1] || null;
  } catch { return null; }
}
export function getEmailFromIdToken(): string | null {
  const t = getIdToken(); if (!t) return null;
  const payload = JSON.parse(atob(t.split(".")[1]));
  return payload.email || payload["cognito:username"] || null;
}