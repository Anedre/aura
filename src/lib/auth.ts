// src/lib/auth.ts
// Amplify v6 (modular). Este archivo NO debe importar desde "@/lib/api".

import {
  signIn,
  signOut,
  signUp,
  confirmSignUp,
  resendSignUpCode,
  fetchAuthSession,
} from "aws-amplify/auth";

export const SESSION_KEY = "aura:session";

/** Sesión persistida en localStorage */
export type Session = {
  token?: string;       // token genérico para Authorization
  idToken?: string;     // JWT de id
  accessToken?: string; // JWT de acceso
  jwt?: string;         // alias (compatibilidad)
  email?: string;
  user_id?: string;     // id “amigable” para UI (p. ej. parte local del email)
};

/* ---------------- utilidades internas ---------------- */

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function base64UrlToUtf8(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  if (isBrowser()) {
    // atob solo existe en navegador
    const bin = atob(b64);
    // binario → UTF-8
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const dec = new TextDecoder("utf-8");
    return dec.decode(bytes);
  } else {
    // Node/SSR
    return Buffer.from(b64, "base64").toString("utf8");
  }
}

type JwtClaims = {
  sub?: string;
  email?: string;
  username?: string;
  "cognito:username"?: string;
} & Record<string, unknown>;

function parseJwtClaims(jwt?: string): JwtClaims | null {
  if (!jwt) return null;
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = base64UrlToUtf8(parts[1]);
    return JSON.parse(payload) as JwtClaims;
  } catch {
    return null;
  }
}

/** Deriva un user_id estable a partir de la sesión */
function deriveUserId(s: Session): string | undefined {
  // 1) Si ya viene, úsalo
  if (s.user_id && s.user_id.trim()) return s.user_id.trim();

  // 2) Derivarlo del email
  if (s.email && s.email.includes("@")) {
    const local = s.email.split("@")[0]?.trim();
    if (local) return local;
  }

  // 3) Derivarlo de los claims del token (id/access/jwt)
  const token = s.idToken ?? s.accessToken ?? s.jwt ?? s.token;
  const claims = parseJwtClaims(token);
  if (claims) {
    const candidates = [
      claims.username,
      claims["cognito:username"],
      claims.email,
      claims.sub,
    ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);

    if (candidates.length) {
      const raw = candidates[0];
      return raw.includes("@") ? raw.split("@")[0] : raw;
    }
  }

  return undefined;
}

/* ---------------- API pública ---------------- */

export function getSession(): Session | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(s: Session): void {
  if (!isBrowser()) return;
  const user_id = deriveUserId(s);
  const next: Session = user_id ? { ...s, user_id } : s;
  localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  // Evento interno para vistas que deseen reaccionar (misma pestaña)
  window.dispatchEvent(new Event("aura:session:changed"));
}

export function clearSession(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("aura:session:changed"));
}

/** Devuelve el user_id o null si no hay sesión */
export function getUserId(): string | null {
  const s = getSession();
  const uid = s && (s.user_id ?? deriveUserId(s));
  return uid ?? null;
}

/** Devuelve el user_id o un valor por defecto (por omisión: "guest") */
export function getUserIdOr(fallback = "guest"): string {
  return getUserId() ?? fallback;
}

/* ---------------- Flujo de autenticación (Amplify v6) ---------------- */

export async function signup(
  email: string,
  password: string,
  attrs: Record<string, string> = {}
): Promise<void> {
  await signUp({
    username: email,
    password,
    options: { userAttributes: { email, ...attrs } },
  });
}

export async function confirmSignup(email: string, code: string): Promise<void> {
  await confirmSignUp({ username: email, confirmationCode: code });
}

export async function resendConfirmation(email: string): Promise<void> {
  await resendSignUpCode({ username: email });
}

export async function login(email: string, password: string): Promise<Session> {
  // 1) Autenticar
  await signIn({ username: email, password });

  // 2) Obtener tokens activos
  const { tokens } = await fetchAuthSession();
  const idToken = tokens?.idToken?.toString();
  const accessToken = tokens?.accessToken?.toString();
  const token = idToken ?? accessToken ?? undefined;

  // 3) Materializar Session (con user_id derivado)
  const session: Session = {
    token,
    idToken,
    accessToken,
    jwt: token, // compatibilidad con código legado
    email,
  };
  setSession(session);
  return session;
}

export async function logout(): Promise<void> {
  await signOut();
  clearSession();
}
