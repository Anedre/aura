// src/lib/auth.ts
"use client";

import { setupAmplify } from "./amplify-config";
import {
  signIn,
  signOut,
  signUp,
  confirmSignUp,
  getCurrentUser,
  fetchAuthSession,
  type SignInInput,
} from "aws-amplify/auth";

export type Session = {
  user_id: string;
  email: string;
  idToken: string;
  accessToken: string;
  // refreshToken: NO expuesto por Amplify v6 → no lo uses
  expiresAt?: number;
};

const LS_KEY = "aura_session";

function saveLocal(sess: Session) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(sess)); } catch {}
}
function loadLocal(): Session | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch { return null; }
}
export function clearLocal() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}

export async function login(email: string, password: string): Promise<Session> {
  setupAmplify(); // asegura configuración

  const input: SignInInput = { username: email, password };
  await signIn(input); // si hay desafíos (MFA, etc.), aquí deberías manejarlos

  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString() ?? "";
  const accessToken = session.tokens?.accessToken?.toString() ?? "";
  const userSub = session.userSub ?? (await getCurrentUser()).userId;

  const out: Session = {
    user_id: userSub,
    email,
    idToken,
    accessToken,
  };
  saveLocal(out);
  return out;
}

export async function logout(): Promise<void> {
  setupAmplify();
  clearLocal();
  await signOut();
}

export async function getSession(): Promise<Session | null> {
  setupAmplify();

  // 1) rápido por cache local
  const cached = loadLocal();
  if (cached?.idToken && cached?.accessToken) return cached;

  // 2) intenta desde Auth
  try {
    const user = await getCurrentUser(); // lanza si no hay sesión
    const sess = await fetchAuthSession();
    const out: Session = {
      user_id: user.userId,
      email: "",
      idToken: sess.tokens?.idToken?.toString() ?? "",
      accessToken: sess.tokens?.accessToken?.toString() ?? "",
    };
    saveLocal(out);
    return out;
  } catch {
    return null;
  }
}

export async function register(email: string, password: string) {
  setupAmplify();
  return signUp({
    username: email,
    password,
    options: { userAttributes: { email }, autoSignIn: false },
  });
}

export async function confirmRegister(email: string, code: string) {
  setupAmplify();
  await confirmSignUp({ username: email, confirmationCode: code });
}

export async function getIdToken(): Promise<string | null> {
  setupAmplify();
  try {
    const s = await fetchAuthSession();
    return s.tokens?.idToken?.toString() ?? null;
  } catch { return null; }
}
