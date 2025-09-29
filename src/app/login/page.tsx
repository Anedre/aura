"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "@/lib/api";
import { setSession } from "@/lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("demo@local");
  const [password, setPassword] = useState("demo123");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/profile";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMsg(null);
    try {
      const s = await login(email, password);
      setSession(s);
      router.replace(next);
    } catch (e: any) {
      setMsg(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-md mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">Iniciar sesión</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <input value={email} onChange={(e)=>setEmail(e.target.value)}
                 className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2" placeholder="email" />
          <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)}
                 className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2" placeholder="contraseña" />
          <button disabled={loading}
                  className="px-4 py-2 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white">
            {loading ? "Ingresando…" : "Entrar"}
          </button>
        </form>
        {msg && <div className="text-sm opacity-80">{msg}</div>}
      </div>
    </main>
  );
}
