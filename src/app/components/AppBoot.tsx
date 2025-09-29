"use client";

import { useEffect, useState } from "react";
import { pingFeed, pingPaper } from "@/lib/api";
import LoadingScreen from "@/app/components/LoadingScreen";

type Health = { feed: boolean | null; paper: boolean | null };

export default function AppBoot() {
  const [ready, setReady] = useState(false);
  const [health, setHealth] = useState<Health>({ feed: null, paper: null });

  useEffect(() => {
    let alive = true;
    const MIN_SPLASH_MS = 900;

    (async () => {
      const t0 = Date.now();
      try {
        const [f, p] = await Promise.all([pingFeed(), pingPaper()]);
        if (!alive) return;
        setHealth({ feed: f, paper: p });
      } catch {
        if (!alive) return;
        setHealth({ feed: false, paper: false });
      } finally {
        const dt = Date.now() - t0;
        const rest = Math.max(0, MIN_SPLASH_MS - dt);
        setTimeout(() => alive && setReady(true), rest);
      }
    })();

    return () => { alive = false; };
  }, []);

  const bad = ready && (health.feed === false || health.paper === false);

  return (
    <>
      <LoadingScreen show={!ready} />
      {bad && (
        <div className="fixed top-0 inset-x-0 z-[60]">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm px-3 py-2">
              <b>Advertencia:</b> no se pudo verificar {health.feed === false && "Feed"}{health.feed === false && health.paper === false && " y "}
              {health.paper === false && "Paper"}.
              La app seguirá cargando con capacidades limitadas.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
