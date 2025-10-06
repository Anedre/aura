"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, logout } from "@/lib/auth";
import { notify } from "@/lib/notify";

type Sess = {
  user_id: string;
  email: string;
  expiresAt?: number; // epoch seconds
};

function mask(s?: string, keep = 4) {
  if (!s) return "";
  if (s.length <= keep * 2) return s;
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
}

function secsToHuman(secs?: number) {
  if (!secs) return "—";
  const now = Math.floor(Date.now() / 1000);
  const d = secs - now;
  if (d <= 0) return "expirado";
  const m = Math.floor(d / 60);
  if (m < 1) return `${d}s`;
  const h = Math.floor(m / 60);
  if (h < 1) return `${m}m`;
  const r = m % 60;
  return `${h}h ${r}m`;
}

export default function ProfilePage() {
  const router = useRouter();
  const [sess, setSess] = useState<Sess | null>(null);

  // Carga sesión para mostrar datos (el guard de (authed) ya protege la ruta)
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await getSession();
      if (!alive) return;
      setSess(s ? { user_id: s.user_id, email: s.email, expiresAt: s.expiresAt } : null);
    })();
    return () => { alive = false; };
  }, []);

  // --------- Cambio de contraseña ----------
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(() => {
    return oldPwd.length >= 1 && newPwd.length >= 8; // Cognito validará políticas reales
  }, [oldPwd, newPwd]);

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      notify("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    try {
      setBusy(true);
      const { updatePassword } = await import("aws-amplify/auth"); // v6
      await updatePassword({ oldPassword: oldPwd, newPassword: newPwd });
      setOldPwd(""); setNewPwd("");
      notify("Contraseña actualizada.");
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "No se pudo actualizar la contraseña.";
        notify(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    try {
      await logout();
    } finally {
      router.replace("/"); // vuelve al login
    }
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Perfil</h1>
          <button className="btn" onClick={onLogout}>Cerrar sesión</button>
        </header>

        {/* Datos básicos */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 grid sm:grid-cols-2 gap-6">
          <div>
            <div className="text-xs opacity-70 mb-1">Email</div>
            <div className="text-sm">{sess?.email ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs opacity-70 mb-1">User ID (sub)</div>
            <div className="text-sm">{mask(sess?.user_id, 6)}</div>
          </div>
          <div>
            <div className="text-xs opacity-70 mb-1">Expiración del token</div>
            <div className="text-sm">{secsToHuman(sess?.expiresAt)}</div>
          </div>
          <div>
            <div className="text-xs opacity-70 mb-1">Estado</div>
            <div className="text-sm">{sess ? "Autenticado" : "—"}</div>
          </div>
        </section>

        {/* Cambio de contraseña */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="font-semibold mb-3">Actualizar contraseña</h2>
          <form onSubmit={onChangePassword} className="grid gap-3 max-w-md">
            <label className="grid gap-1">
              <span className="text-xs opacity-70">Contraseña actual</span>
              <input
                type="password"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 outline-none focus:ring-2 ring-white/20"
                autoComplete="current-password"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs opacity-70">Nueva contraseña</span>
              <input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 outline-none focus:ring-2 ring-white/20"
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
              />
            </label>
            <div className="flex gap-2 pt-2">
              <button className="btn" type="submit" disabled={!canSubmit || busy}>
                {busy ? "Actualizando…" : "Guardar"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => { setOldPwd(""); setNewPwd(""); }}
                disabled={busy}
              >
                Limpiar
              </button>
            </div>
          </form>
          <p className="text-xs opacity-70 mt-3">
            La política exacta de contraseñas la valida Cognito (longitud, complejidad, etc.).
          </p>
        </section>
      </div>
    </main>
  );
}
