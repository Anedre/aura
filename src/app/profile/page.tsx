// src/app/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
  getProfile,
  updateProfile,
  recommendByProfile,
  type UserProfile,
} from "@/lib/api";
import { getSession, getUserIdOr } from "@/lib/auth";
import { useRouter } from "next/navigation";

type RecoItem = {
  symbol: string;
  action: "BUY" | "SELL" | "ABSTAIN";
  p_conf?: number | null;
  score?: number | null;
};

export default function ProfilePage() {
  // ✅ hooks dentro del componente
  const router = useRouter();
  const sess = getSession(); // usa localStorage (solo cliente)
  const user_id = sess?.user_id ?? getUserIdOr();

  // guard: si no hay sesión, redirige al login
  useEffect(() => {
    if (!sess) router.replace("/login?next=/profile");
  }, [sess, router]);

  const [p, setP] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [recs, setRecs] = useState<RecoItem[] | null>(null);

  // carga del perfil
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const pf = await getProfile(user_id);
        if (alive) setP(pf);
      } catch (e) {
        // opcional: manejar error
      }
    })();
    return () => {
      alive = false;
    };
  }, [user_id]);

  if (!p) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <div className="max-w-xl mx-auto p-6">
          Cargando perfil…{" "}
          {sess ? "" : <a className="underline" href="/login">Iniciar sesión</a>}
        </div>
      </main>
    );
  }

  function upd<K extends keyof UserProfile>(k: K, v: UserProfile[K]) {
    setP({ ...p!, [k]: v });
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await updateProfile(p!);
      setP(res);
      setMsg("Perfil actualizado ✅");
    } catch (e: any) {
      setMsg(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function getTop5() {
    setMsg("Calculando recomendaciones…");
    try {
      const out = await recommendByProfile(user_id);
      setRecs(
        out.items.map((i) => ({
          symbol: i.symbol,
          action: i.action,
          p_conf: i.p_conf ?? null,
          score: (i as any).score ?? null,
        }))
      );
      setMsg("Listo ✅");
    } catch (e: any) {
      setMsg(`Error: ${e?.message ?? String(e)}`);
    }
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <header>
          <h1 className="text-2xl font-bold">Mi perfil de inversión</h1>
          <p className="text-sm opacity-70">
            Usado para personalizar recomendaciones.
          </p>
        </header>

        <section className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">
            Objetivo
            <select
              value={p.objective ?? ""}
              onChange={(e) => upd("objective", e.target.value as any)}
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
              onChange={(e) => upd("risk", e.target.value as any)}
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
                    .filter(Boolean)
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
            <h2 className="text-sm font-semibold opacity-80 mb-2">
              Recomendaciones
            </h2>
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
