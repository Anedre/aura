"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getSession,              // ← lee sesión desde Cognito (async)
  clearSessionCache,            // ← limpia el cache local
  type AuraSession,            // ← alias de AuraSession
  SESSION_KEY,
  logout as authLogout,    // ← logout real (Cognito)
} from "@/lib/auth";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/app/components/ThemeToggle";
import { useToast } from "@/app/components/toast/ToastProvider";
import { useHealth } from "@/app/components/HealthContext";

export default function NavBar() {
  const [sess, setSess] = useState<AuraSession | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { health } = useHealth();

  // Lee sesión al montar y reacciona a cambios en localStorage
  useEffect(() => {
    let alive = true;

    (async () => {
      const s = await getSession();
      if (!alive) return;
      setSess(s);
    })();

    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_KEY) {
        (async () => setSess(await getSession()))();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  async function doLogout() {
    try {
      await authLogout();    // ← cierra sesión en Cognito
    } finally {
      clearSessionCache();        // ← limpia cache local
      setSess(null);
      router.replace("/login");
    }
  }

  function onNavFeed(e: React.MouseEvent) {
    e.preventDefault();
    if (health.feed === false) {
      toast("El Feed no está disponible en este momento.", "warning");
      return;
    }
    router.push("/feed");
  }

  function onNavPaper(e: React.MouseEvent) {
    e.preventDefault();
    if (health.paper === false) {
      toast("Paper Trading no está disponible por mantenimiento.", "warning");
      return;
    }
    router.push("/paper");
  }

  return (
    <header className="sticky top-0 z-50 backdrop-blur bg-black/30 border-b border-white/10">
      <nav className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-wide">AURA</Link>

        <div className="flex items-center gap-2 text-sm">
          <button onClick={onNavFeed} className="opacity-90 hover:opacity-100 px-2 py-1 rounded-lg">
            Feed
          </button>
          <button onClick={onNavPaper} className="opacity-90 hover:opacity-100 px-2 py-1 rounded-lg">
            Paper
          </button>

          <ThemeToggle />

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
