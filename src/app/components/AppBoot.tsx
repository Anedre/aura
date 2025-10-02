"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { pingFeed, pingPaper } from "@/lib/api";
import Splash from "@/app/components/Splash";
import { Amplify } from "aws-amplify";
import { amplifyConfig } from "@/lib/amplify-config";
import { useHealth } from "@/app/components/HealthContext";

const PUBLIC_ROUTES = new Set<string>(["/login", "/register"]);

export default function AppBoot() {
  const pathname = usePathname() || "/";
  const isPublic = useMemo(() => PUBLIC_ROUTES.has(pathname), [pathname]);

  const { setHealth } = useHealth();
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false); // para portal seguro

  // Configurar Amplify una sola vez en cliente
  useEffect(() => {
    Amplify.configure(amplifyConfig);
    setMounted(true);
  }, []);

  useEffect(() => {
    let alive = true;

    // En rutas públicas NO bloquees la UI con pings (evita splash prolongado)
    if (isPublic) {
      setHealth({ ready: true });
      setReady(true);
      return () => { alive = false; };
    }

    const MIN_SPLASH_MS = 900;
    (async () => {
      const t0 = Date.now();
      try {
        const [feedOk, paperOk] = await Promise.all([
          // Trata 401 como "no disponible", no como fallo fatal
          pingFeed().catch(() => false),
          pingPaper().catch(() => false),
        ]);
        if (!alive) return;
        setHealth({ feed: !!feedOk, paper: !!paperOk });
      } finally {
        const dt = Date.now() - t0;
        const rest = Math.max(0, MIN_SPLASH_MS - dt);
        setTimeout(() => {
          if (!alive) return;
          setHealth({ ready: true });
          setReady(true);
        }, rest);
      }
    })();

    return () => { alive = false; };
  }, [isPublic, setHealth]);

  // Splash via portal para no alterar el árbol SSR → evita #418
  if (!ready && mounted && typeof window !== "undefined") {
    return createPortal(<Splash label="Inicializando modelo y datos…" />, document.body);
  }
  return null;
}
