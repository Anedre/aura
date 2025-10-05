// src/app/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
  getProfile,
  updateProfile,
  recommendByProfile,
  type UserProfile,
} from "@/lib/api.profile";
import { getSession, type AuraSession } from "@/lib/auth";
import { useRouter } from "next/navigation";

type RecoItem = {
  symbol: string;
  action: "BUY" | "SELL" | "ABSTAIN" | "HOLD";
  p_conf?: number | null;
  score?: number | null;
};

export default function ProfilePage() {
  const router = useRouter();

  // sess === undefined -> cargando; null -> no autenticado; AuraSession -> ok
  const [sess, setSess] = useState<AuraSession | null | undefined>(undefined);
  const [p, setP] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [recs, setRecs] = useState<RecoItem[] | null>(null);

  // 1) Resolver sesión (asíncrona)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await getSession(); // si es síncrono, await no molesta
        if (alive) setSess(s);
      } catch {
        if (alive) setSess(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 2) Redirigir si no hay sesión
  useEffect(() => {
    if (sess === null) {
      router.replace("/login?next=/profile");
    }
  }, [sess, router]);

  // 3) Cargar perfil cuando haya user_id
  useEffect(() => {
    if (!sess?.user_id) return;
    let alive = true;
    (async () => {
      try {
        const pf = await getProfile(sess.user_id);
        if (alive) setP(pf);
     } catch {
        // podrías setear msg si quieres mostrar el error
      }
    })();
    return () => {
      alive = false;
    };
  }, [sess?.user_id]);

  // Pantallas de estado inicial
  if (sess === undefined) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <div className="max-w-xl mx-auto p-6">Cargando sesión…</div>
      </main>
    );
  }
  if (sess === null) {
    // mientras hace el replace, un fallback simple
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <div className="max-w-xl mx-auto p-6">Redirigiendo al login…</div>
      </main>
    );
  }
  if (!p) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <div className="max-w-xl mx-auto p-6">Cargando perfil…</div>
      </main>
    );
  }

  function upd<K extends keyof UserProfile>(k: K, v: UserProfile[K]) {
    setP({ ...p!, [k]: v });
  }

  async function save() {
    if (!sess?.user_id) return;     // ⬅️ guarda defensiva
    setSaving(true);
    setMsg(null);
    try {
      const res = await updateProfile({ ...p!, user_id: sess.user_id });
      setP(res);
      setMsg("Perfil actualizado ✅");
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      setMsg(`Error: ${m}`);
    } finally {
      setSaving(false);
    }
  }

  async function getTop5() {
    if (!sess?.user_id) return;     // ⬅️ guarda defensiva
    setMsg("Calculando recomendaciones…");
    try {
      const out = await recommendByProfile(sess.user_id, 5);
      setRecs(
        out.items.map((i) => ({
          symbol: i.symbol,
          action: i.action,
          p_conf: i.p_conf ?? null,
          score: typeof i.score === "number" ? i.score : null,
        })),
      );
      setMsg("Listo ✅");
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      setMsg(`Error: ${m}`);
    }
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <header>
          <h1 className="text-2xl font-bold">Mi perfil de inversión</h1>
          <p className="text-sm opacity-70">Usado para personalizar recomendaciones.</p>
        </header>

        <section className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">
            Objetivo
            <select
              value={p.objective ?? ""}
              onChange={(e) => upd("objective", e.target.value as UserProfile["objective"])}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1"
            >
              <option value="ahorro">Ahorro</option>
              <option value="crecimiento">Crecimiento</option>
              <option value="ingresos">Ingresos</option>
              <option value="mixto">Mixto</option>
            </select>
          </label>
          <label className="text-sm">
            Riesgo
            <select
              value={p.risk ?? ""}
              onChange={(e) => upd("risk", e.target.value as UserProfile["risk"])}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1"
            >
              <option value="conservador">Conservador</option>
              <option value="moderado">Moderado</option>
              <option value="agresivo">Agresivo</option>
            </select>
          </label>
          <label className="text-sm">
            Plazo (meses)
            <input
              type="number"
              value={p.horizon_months ?? 12}
              onChange={(e) => upd("horizon_months", Number(e.target.value))}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1"
            />
          </label>
          <label className="text-sm">
            Capital disponible
            <input
              type="number"
              step="any"
              value={p.capital ?? 1000}
              onChange={(e) => upd("capital", Number(e.target.value))}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Restricciones (coma-separado)
            <input
              value={(p.constraints ?? []).join(",")}
              onChange={(e) =>
                upd(
                  "constraints",
                  e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                )
              }
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1"
            />
          </label>
        </section>

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
          <button
            onClick={getTop5}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10"
          >
            Top 5 según mi perfil
          </button>
        </div>

        {msg && <div className="text-sm opacity-80">{msg}</div>}

        {recs && (
          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-sm font-semibold opacity-80 mb-2">Recomendaciones</h2>
            <div className="grid gap-2">
              {recs.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm border-b border-white/10 pb-1"
                >
                  <div className="font-semibold">{r.symbol}</div>
                  <div
                    className={`px-2 py-0.5 rounded-full text-xs ring-1 ${
                      r.action === "BUY"
                        ? "ring-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : r.action === "SELL"
                        ? "ring-rose-500/30 bg-rose-500/10 text-rose-300"
                        : "ring-amber-500/30 bg-amber-500/10 text-amber-300"
                    }`}
                  >
                    {r.action}
                  </div>
                  <div className="opacity-70">
                    {r.p_conf ? `${Math.round(r.p_conf * 100)}%` : "—"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
