// app/page.tsx — Split centrado con copy claro, chips nuevos y animación suave
"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login, getSession } from "@/lib/auth";
import { loadRiskProfile } from "@/lib/invest";
import ThemeToggle from "@/app/components/theme/ThemeToggle";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams(); 
  const decideDefaultNext = () => (loadRiskProfile() ? "/feed" : "/risk?first=1");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const sess = await getSession();
      if (!alive) return;
      if (sess) {
        const paramNext = searchParams.get("next");
        router.replace(paramNext || decideDefaultNext());
      }
    })();
    return () => { alive = false; };
  }, [router, searchParams]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      await login(email, password);
      const paramNext = searchParams.get("next");
      router.replace(paramNext || decideDefaultNext());
    } catch (err: unknown) {
      setMsg((err as { message?: string })?.message ?? "No fue posible autenticar. Verifica tus credenciales.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="relative min-h-[100dvh] grid place-items-center px-4 sm:px-6 lg:px-8"
      style={{
        paddingTop: "calc(24px + env(safe-area-inset-top))",
        paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
        paddingLeft: "calc(16px + env(safe-area-inset-left))",
        paddingRight: "calc(16px + env(safe-area-inset-right))",
      }}
    >
      {/* Orbes sutiles */}
      <div className="aura-orb -z-10 left-[-12rem] top-[-10rem] opacity-70 scale-75 sm:scale-90 lg:scale-100" />
      <div className="aura-orb aura-orb--accent -z-10 right-[-14rem] bottom-[-12rem] hidden md:block" />

      <div className="w-full max-w-[1200px] grid gap-6 md:grid-cols-12 items-center">
        {/* IZQUIERDA (info) */}
        <aside className="hidden md:block md:col-span-6 self-center">
          <div className="card/soft border border-white/10 p-6 lg:p-10 fade-in-up transition-transform duration-300 will-change-transform motion-reduce:transition-none md:hover:-translate-y-[2px]">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-2xl bg-primary/20 grid place-items-center">▲</div>
              <h1 className="text-[clamp(1.5rem,1rem+1.5vw,2.25rem)] font-semibold tracking-tight">AURA</h1>
            </div>
            <h2 className="text-[clamp(1.25rem,1.1rem+1vw,2rem)] font-semibold text-balance">
              Predicción de activos, clara y directa
            </h2>
            <p className="mt-2 opacity-85 text-pretty text-[clamp(.95rem,.9rem+.2vw,1.05rem)]">
              Recibe señales diarias sobre activos líquidos y digitales. Simula tus movimientos antes de invertir y entiende cada recomendación con explicaciones simples.
            </p>

            <ul className="mt-6 space-y-3 text-sm">
              <li className="flex gap-3">
                <div className="mt-0.5 h-6 w-6 rounded-full bg-white/5 grid place-items-center">📅</div>
                <div>
                  <p className="font-medium">Predicciones diarias</p>
                  <p className="opacity-80">Actualizaciones constantes para que sepas cuándo entrar o esperar.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <div className="mt-0.5 h-6 w-6 rounded-full bg-white/5 grid place-items-center">🎯</div>
                <div>
                  <p className="font-medium">Simulador de trading</p>
                  <p className="opacity-80">Prueba estrategias sin arriesgar dinero y compara resultados.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <div className="mt-0.5 h-6 w-6 rounded-full bg-white/5 grid place-items-center">📚</div>
                <div>
                  <p className="font-medium">Aprende mientras inviertes</p>
                  <p className="opacity-80">Explicaciones cortas, tips y recursos para tomar mejores decisiones.</p>
                </div>
              </li>
            </ul>

            {/* Chips actualizados (más atractivos para el usuario) */}
            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/10 px-2.5 py-1">Simula sin riesgo</span>
              <span className="rounded-full border border-white/10 px-2.5 py-1">Listas personalizadas</span>
              <span className="rounded-full border border-white/10 px-2.5 py-1">Aprendizaje express</span>
            </div>
          </div>
        </aside>

        {/* MÓVIL: logo arriba */}
        <header className="md:hidden grid place-items-center self-end -mt-6 fade-in-up">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-2xl bg-primary/20 grid place-items-center">▲</div>
            <span className="text-xl font-semibold tracking-wide">AURA</span>
          </div>
        </header>

        {/* Login */}
        <section className="md:col-span-6 self-center">
          <div className="mx-auto w-full max-w-[min(520px,90vw)] card p-5 sm:p-6 lg:p-7 shadow-xl/soft border border-white/10 fade-in-up transition-transform duration-300 will-change-transform motion-reduce:transition-none md:hover:-translate-y-[2px]">
            <header className="mb-4">
              <h3 className="text-[clamp(1.1rem,1rem+.3vw,1.35rem)] font-semibold">Iniciar sesión</h3>
              <p className="text-sm opacity-80">Accede para continuar</p>
            </header>

            <form onSubmit={onSubmit} className="space-y-4" aria-busy={loading}>
              <div>
                <label className="block text-sm mb-1">Email</label>
                <input
                  type="email"
                  className="input h-12"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  inputMode="email"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    className="input h-12 pr-12"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs opacity-80 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => setShowPwd((v) => !v)}
                    aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPwd ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              {msg && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2 text-sm">
                  {msg}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn btn-primary h-12 w-full text-base">
                {loading ? "Ingresando…" : "Ingresar"}
              </button>

              <p className="text-xs opacity-70 text-center">
                Al continuar aceptas nuestros términos y el tratamiento seguro de tus datos.
              </p>

              <div className="text-sm opacity-90 text-center">
                ¿No tienes cuenta? <a className="link" href="/register">Crea una aquí</a>
              </div>
            </form>
          </div>
        </section>
      </div>

      {/* Toggle de tema flotante */}
      <div className="fixed right-3 top-3 md:right-6 md:top-6 z-20">
        <ThemeToggle className="btn btn-ghost btn-sm md:btn" />
      </div>
    </main>
  );
}

export default function LoginPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;

  return (
    <Suspense fallback={<div className="p-6">Cargando…</div>}>
      <LoginInner />
    </Suspense>
  );
}
