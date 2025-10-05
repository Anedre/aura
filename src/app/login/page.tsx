"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthShell from "@/app/components/AuthShell";
import { login, getSession } from "@/lib/auth"; // ⬅️ usar Cognito (Amplify v6)

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/feed"; // ⬅️ por defecto al feed

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Si ya hay sesión activa, salir del login inmediatamente
  useEffect(() => {
    let alive = true;
    (async () => {
      const sess = await getSession();
      if (!alive) return;
      if (sess) router.replace(next);
    })();
    return () => { alive = false; };
  }, [next, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      await login(email, password);   // ⬅️ autentica en Cognito y cachea sesión
      router.replace(next);           // ⬅️ salta a next o /feed
    } catch (err: unknown) {
      const message =
        (err as { message?: string })?.message ??
        "No fue posible autenticar. Verifica tus credenciales.";
      setMsg(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Iniciar sesión"
      subtitle="Accede para continuar con tu flujo de inversión"
      footer={
        <div>
          ¿No tienes cuenta?{" "}
          <a className="link" href="/register">Crea una aquí</a>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3" aria-busy={loading}>
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Contraseña</label>
          <div className="relative">
            <input
              type={showPwd ? "text" : "password"}
              className="input pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs opacity-80 hover:opacity-100"
              onClick={() => setShowPwd((v) => !v)}
              aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPwd ? "🙈" : "👁️"}
            </button>
          </div>
        </div>

        {msg && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2 text-sm">
            {msg}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn btn-primary w-full">
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  // Gate de hidratación para evitar SSR≠CSR
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;

  return (
    <Suspense fallback={<div className="p-6">Cargando…</div>}>
      <LoginInner />
    </Suspense>
  );
}
