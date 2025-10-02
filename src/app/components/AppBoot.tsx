"use client";

import { useEffect, useState } from "react";
import { pingFeed, pingPaper } from "@/lib/api";
import Splash from "@/app/components/Splash";
import { Amplify } from "aws-amplify";
import { amplifyConfig } from "@/lib/amplify-config";
import { useHealth } from "@/app/components/HealthContext";

export default function AppBoot() {
  const { setHealth } = useHealth();
  const [ready, setReady] = useState(false);

  // Configurar Amplify una sola vez en cliente
  useEffect(() => {
    Amplify.configure(amplifyConfig);
  }, []);

  useEffect(() => {
    let alive = true;
    const MIN_SPLASH_MS = 900;

    (async () => {
      const t0 = Date.now();
      try {
        const [feedOk, paperOk] = await Promise.all([pingFeed(), pingPaper()]);
        if (!alive) return;
        setHealth({ feed: feedOk, paper: paperOk });
      } catch {
        if (!alive) return;
        setHealth({ feed: false, paper: false });
      } finally {
        const dt = Date.now() - t0;
        const rest = Math.max(0, MIN_SPLASH_MS - dt);
        setTimeout(() => alive && setReady(true), rest);
        setHealth({ ready: true });
      }
    })();

    return () => {
      alive = false;
    };
  }, [setHealth]);

  if (!ready) return <Splash label="Inicializando modelo y datos…" />;
  return null;
}
