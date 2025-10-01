"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSession, clearSession, type Session } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/api";

export default function NavBar() {
  const [sess, setSess] = useState<Session | null>(null);
  const router = useRouter();

  // hidrata estado de sesión desde localStorage
  useEffect(() => {
    setSess(getSession());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "aura:session") setSess(getSession());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  async function doLogout() {
    try {
      await logout();    // cierra sesión Cognito (tokens)
    } finally {
      clearSession();    // limpia sesión UI local
      setSess(null);
      router.replace("/");
    }
  }

  return (
    <header className="sticky top-0 z-50 backdrop-blur bg-black/30 border-b border-white/10">
      <nav className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-wide">AURA</Link>

        <div className="flex items-center gap-4 text-sm">
          <Link href="/feed"  className="opacity-90 hover:opacity-100">Feed</Link>
          <Link href="/paper" className="opacity-90 hover:opacity-100">Paper</Link>

          {sess ? (
            <div className="flex items-center gap-3">
              <Link href="/profile" className="opacity-90 hover:opacity-100">
                {sess.email?.split("@")[0] || "perfil"}
              </Link>
              <button
                onClick={doLogout}
                className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10"
              >
                Salir
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/register"
                className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10"
              >
                Registrarse
              </Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
