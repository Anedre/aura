"use client";

import { useState } from "react";
import {
  register as signup,          // Amplify/Cognito
  confirmRegister,
  resendRegisterCode
} from "@/lib/auth";
import { useRouter } from "next/navigation";
import AuthShell from "@/app/components/AuthShell";
import Link from "next/link";


function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return "Error desconocido"; }
}

export default function RegisterPage() {
  const router = useRouter();

  const [step, setStep] = useState<"form" | "confirm">("form");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");        // opcional para UI/branding futuro
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nameInputId = "register-name";
  const emailInputId = "register-email";
  const passwordInputId = "register-password";
  const codeInputId = "register-code";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      await signup(email, password);
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
      await confirmRegister(email, code);
      setMsg("Cuenta confirmada. Ahora puedes iniciar sesión.");
      // tras confirmar, que el siguiente paso sea completar su perfil
      router.replace(`/login?next=${encodeURIComponent("/profile?tour=intro")}`);
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
      await resendRegisterCode(email);
      setMsg("Código reenviado.");
    } catch (err: unknown) {
      setMsg(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  return step === "form" ? (
    <AuthShell
      title="Crear cuenta"
      subtitle="Configura tu acceso para empezar"
      footer={
        <div>
          ¿Ya tienes cuenta?{" "}
          <Link className="link" href="/">Inicia sesión</Link>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3" aria-busy={loading ? "true" : "false"}>
        <div>
          <label className="block text-sm mb-1" htmlFor={nameInputId}>Nombre</label>
          <input
            id={nameInputId}
            type="text"
            aria-label="Nombre"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
        </div>
        <div>
          <label className="block text-sm mb-1" htmlFor={emailInputId}>Email</label>
          <input
            id={emailInputId}
            type="email"
            aria-label="Email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label className="block text-sm mb-1" htmlFor={passwordInputId}>Contraseña</label>
          <div className="relative">
            <input
              id={passwordInputId}
              type={showPwd ? "text" : "password"}
              aria-label="Contraseña"
              className="input pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
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
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-3 py-2 text-sm">
            {msg}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn btn-primary w-full">
          {loading ? "Creando…" : "Crear cuenta"}
        </button>
      </form>
    </AuthShell>
  ) : (
    <AuthShell
      title="Confirmar cuenta"
      subtitle="Ingresa el código que te enviamos por correo"
      footer={
        <div>
          ¿No recibiste el código?{" "}
          <button onClick={onResend} className="link">Reenviar</button>
        </div>
      }
    >
      <form onSubmit={onConfirm} className="space-y-3" aria-busy={loading ? "true" : "false"}>
        <div>
          <label className="block text-sm mb-1" htmlFor={`${emailInputId}-readonly`}>Email</label>
          <input id={`${emailInputId}-readonly`} type="email" className="input" value={email} readOnly />
        </div>

        <div>
          <label className="block text-sm mb-1" htmlFor={codeInputId}>Código</label>
          <input
            id={codeInputId}
            aria-label="Código de verificación"
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Código enviado a tu correo"
            required
            autoComplete="one-time-code"
          />
        </div>

        {msg && (
          <div className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm">
            {msg}
          </div>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="btn btn-primary flex-1">
            {loading ? "Confirmando…" : "Confirmar"}
          </button>
          <button type="button" onClick={onResend} disabled={loading} className="btn">
            Reenviar código
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
