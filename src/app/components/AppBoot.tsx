"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { pingFeed, pingPaper } from "@/lib/api";
import Splash from "@/app/components/Splash";
import { Amplify } from "aws-amplify";
import { amplifyConfig } from "@/lib/amplify-config";
import { useHealth } from "@/app/components/HealthContext";
import { useToast } from "@/app/components/toast/ToastProvider";

// Rutas públicas donde no bloqueamos con health-check
const PUBLIC_ROUTES = new Set<string>(["/login", "/register"]);

// Pequeño helper para no colgarnos si la red está mal
async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default function AppBoot() {
  const pathname = usePathname() || "/";
  const isPublic = useMemo(() => PUBLIC_ROUTES.has(pathname), [pathname]);

  const { setHealth } = useHealth();
  const { toast } = useToast();

  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Evita doble configure() bajo StrictMode
  const configuredRef = useRef(false);

  useEffect(() => {
    if (!configuredRef.current) {
      Amplify.configure(amplifyConfig);
      configuredRef.current = true;
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    let alive = true;

    // En rutas públicas no bloquees/hagas ruido
    if (isPublic) {
      setHealth({ ready: true });
      setReady(true);
      return () => {
        alive = false;
      };
    }

    const MIN_SPLASH_MS = 900;

    (async () => {
      const t0 = Date.now();
      try {
        // Protegemos los pings con timeout y capturamos 4xx/5xx
        const [feedOk, paperOk] = await Promise.all([
          withTimeout(pingFeed().catch(() => false), 2500, false),
          withTimeout(pingPaper().catch(() => false), 2500, false),
        ]);

        if (!alive) return;

        setHealth({ feed: !!feedOk, paper: !!paperOk });

        // Notifica solo lo que falla, sin bloquear
        if (!feedOk)  toast("Feed no disponible (v1/feed).", "warning");
        if (!paperOk) toast("Paper trade no disponible (paper_trade/health).", "warning");
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

    return () => {
      alive = false;
    };
  }, [isPublic, setHealth, toast]);

  // Mantén el Splash por portal → no altera el árbol SSR (evita #418)
  if (!ready && mounted && typeof window !== "undefined") {
    return createPortal(<Splash label="Inicializando modelo y datos…" />, document.body);
  }
  return null;
}
