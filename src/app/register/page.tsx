// src/app/register/page.tsx
"use client";

import { useState } from "react";
import { signup, confirmSignup, resendConfirmation } from "@/lib/api";
import { useRouter } from "next/navigation";

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return "Error desconocido"; }
}

export default function RegisterPage() {
  const router = useRouter();

  const [step, setStep] = useState<"form" | "confirm">("form");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      await signup(email, password, { name });
      setStep("confirm");
      setMsg("Te enviamos un código de verificación al correo.");
    } catch (err: unknown) {
      setMsg(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      await confirmSignup(email, code);
      setMsg("Cuenta confirmada. Ahora puedes iniciar sesión.");
      router.replace(`/login?next=/profile`);
    } catch (err: unknown) {
      setMsg(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    setMsg(null);
    setLoading(true);
    try {
      await resendConfirmation(email);
      setMsg("Código reenviado.");
    } catch (err: unknown) {
      setMsg(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-sm p-6">
        {step === "form" ? (
          <>
            <h1 className="text-xl font-semibold mb-4">Crear cuenta</h1>
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="block text-sm mb-1">Nombre</label>
                <input
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Email</label>
                <input
                  type="email"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Contraseña</label>
                <input
                  type="password"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {msg && <p className="text-sm opacity-80">{msg}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl px-3 py-2 bg-emerald-600/80 hover:bg-emerald-600 text-white"
              >
                {loading ? "Creando…" : "Crear cuenta"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold mb-4">Confirmar cuenta</h1>
            <form onSubmit={onConfirm} className="space-y-3">
              <div>
                <label className="block text-sm mb-1">Email</label>
                <input
                  type="email"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  readOnly
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Código</label>
                <input
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Código enviado a tu correo"
                  required
                />
              </div>
              {msg && <p className="text-sm opacity-80">{msg}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-xl px-3 py-2 bg-emerald-600/80 hover:bg-emerald-600 text-white"
                >
                  {loading ? "Confirmando…" : "Confirmar"}
                </button>
                <button
                  type="button"
                  onClick={onResend}
                  disabled={loading}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10"
                >
                  Reenviar código
                </button>
              </div>
            </form>
          </>
        )}
        <div className="mt-4 text-sm">
          ¿Ya tienes cuenta? <a className="underline" href="/login">Inicia sesión</a>
        </div>
      </div>
    </main>
  );
}
