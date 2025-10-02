"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Splash from "./Splash";
import * as Auth from "@/lib/auth"; // debe existir tu módulo de auth

const PUBLIC_ROUTES = new Set<string>(["/login", "/register"]);

type Session = {
  idToken?: string;
  accessToken?: string;
  token?: string;
  jwt?: string;
};

type GetSessionFn = () => Promise<Session | null> | Session | null;
type AuthModule = { getSession?: GetSessionFn };

async function fallbackGetSession(): Promise<Session | null> {
  try {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem("SESSION_KEY") : null;
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

async function resolveSession(): Promise<Session | null> {
  const mod = (Auth as unknown) as AuthModule;
  if (typeof mod.getSession === "function") {
    const res = mod.getSession();
    return res instanceof Promise ? await res : res;
  }
  return await fallbackGetSession();
}

export default function SessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (PUBLIC_ROUTES.has(pathname)) {
        setChecking(false);
        return;
      }
      const session = await resolveSession();
      const hasToken =
        !!session &&
        (session.idToken || session.accessToken || session.token || session.jwt);

      if (!hasToken) {
        const next = encodeURIComponent(pathname);
        router.replace(`/login?next=${next}`);
        return;
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (checking) return <Splash label="Verificando sesión…" />;
  return <>{children}</>;
}
