'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { login } from '@/lib/api';
import { setSession } from '@/lib/auth';

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const s = await login(email, password);
      setSession(s);
      router.replace(next);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setMsg(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold mb-4">Iniciar sesión</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-white/20"
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-white/20"
            required
          />
        </div>
        {msg && <p className="text-red-400 text-sm">{msg}</p>}
        <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl px-3 py-2 bg-white/10 hover:bg-white/20 transition"
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-sm p-6">Cargando…</div>}>
      <LoginInner />
    </Suspense>
  );
}
