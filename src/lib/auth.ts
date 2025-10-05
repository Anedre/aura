// src/lib/auth.ts
import "@/lib/amplify-config";
import {
  fetchAuthSession,
  getCurrentUser,
  signIn as cognitoSignIn,
  signOut as cognitoSignOut,
  signUp as cognitoSignUp,
  confirmSignUp as cognitoConfirmSignUp,
  resendSignUpCode as cognitoResendSignUpCode,
} from "aws-amplify/auth";

export const SESSION_KEY = "AURA_SESSION";

/* ===================== Tipos ===================== */

export interface AuthTokens {
  idToken: string;
  accessToken: string;
  expiresAt: number; // epoch seconds
}

export interface AuraSession {
  user_id: string;
  email?: string;
  name?: string;
  tokens: AuthTokens;
}
export type Session = AuraSession;

/** Forma mínima de los tokens que expone Amplify (lo suficiente para tipar). */
type AmplifyJwtLike = {
  toString(): string;
  payload?: Record<string, unknown>;
};
interface AmplifyTokensLike {
  idToken: AmplifyJwtLike;
  accessToken: AmplifyJwtLike;
}

/* ===================== Cache local ===================== */

function readCache(): AuraSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuraSession) : null;
  } catch {
    return null;
  }
}
export function setSession(sess: AuraSession) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
  } catch {}
}
export function clearSessionCache() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

/* ===================== Helpers ===================== */

function pickUserId(payload?: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const p = payload as Record<string, unknown>;
  return (
    (p["sub"] as string | undefined) ??
    (p["cognito:username"] as string | undefined) ??
    (p["username"] as string | undefined) ??
    (p["email"] as string | undefined) ??
    null
  );
}
function pickStr(payload: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = payload?.[key];
  return typeof v === "string" ? v : undefined;
}

function buildAuraSessionFromAmplify(tokensLike: AmplifyTokensLike): AuraSession | null {
  if (!tokensLike?.accessToken || !tokensLike?.idToken) return null;

  const idTokenStr = tokensLike.idToken.toString();
  const accTokenStr = tokensLike.accessToken.toString();

  const idPayload = tokensLike.idToken.payload ?? undefined;
  const accPayload = tokensLike.accessToken.payload ?? undefined;

  const user_id =
    pickUserId(idPayload) ??
    pickUserId(accPayload) ??
    "anonymous";

  const email = pickStr(idPayload, "email") ?? pickStr(accPayload, "email");
  const name = pickStr(idPayload, "name") ?? pickStr(accPayload, "name");

  const expRaw =
    (accPayload?.["exp"] as unknown) ??
    undefined;
  const expiresAt =
    typeof expRaw === "number"
      ? expRaw
      : Number(expRaw) > 0
      ? Number(expRaw)
      : Math.floor(Date.now() / 1000) + 300;

  return {
    user_id,
    email,
    name,
    tokens: { idToken: idTokenStr, accessToken: accTokenStr, expiresAt },
  };
}

/* ===================== API pública ===================== */

export async function getSession(): Promise<AuraSession | null> {
  if (typeof window === "undefined") return null;
  try {
    const { tokens } = await fetchAuthSession();
    const sess = buildAuraSessionFromAmplify(tokens as unknown as AmplifyTokensLike);
    if (sess) setSession(sess);
    return sess;
  } catch {
    return readCache();
  }
}
export function getSessionSync(): AuraSession | null {
  return readCache();
}
export function getAuthHeader(sess?: AuraSession | null): Record<string, string> {
  const s = sess ?? getSessionSync();
  return s ? { Authorization: `Bearer ${s.tokens.accessToken}` } : {};
}
export function isExpired(sess: AuraSession | null | undefined): boolean {
  if (!sess?.tokens?.expiresAt) return true;
  const skew = 30;
  return sess.tokens.expiresAt <= Math.floor(Date.now() / 1000) + skew;
}

export async function signIn(username: string, password: string): Promise<AuraSession> {
  await cognitoSignIn({ username, password });
  const { tokens } = await fetchAuthSession();
  const sess = buildAuraSessionFromAmplify(tokens as unknown as AmplifyTokensLike);
  if (!sess) throw new Error("No se pudo obtener tokens de Cognito tras login.");
  setSession(sess);
  return sess;
}
export async function signOut(): Promise<void> {
  try {
    await cognitoSignOut();
  } finally {
    clearSessionCache();
  }
}

/* Aliases usados por la UI */
export const login = signIn;
export const logout = signOut;

/* Registro / Confirmación */
export async function register(
  email: string,
  password: string,
  attrs?: { name?: string },
): Promise<void> {
  await cognitoSignUp({
    username: email,
    password,
    options: {
      userAttributes: { email, ...(attrs?.name ? { name: attrs.name } : {}) },
    },
  });
}
export async function confirmRegister(email: string, code: string): Promise<void> {
  await cognitoConfirmSignUp({ username: email, confirmationCode: code });
}
export async function resendRegisterCode(email: string): Promise<void> {
  await cognitoResendSignUpCode({ username: email });
}

export async function currentUserSub(): Promise<string | null> {
  try {
    const u = await getCurrentUser();
    return u?.userId ?? null;
  } catch {
    return null;
  }
}
