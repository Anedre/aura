"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { getSession, logout } from "@/lib/auth";
import BottomNav from "@/app/components/nav/BottomNav";
import {
  HomeIcon,
  FeedIcon,
  DemoIcon,
  RiskIcon,
  InvestIcon,
  SimIcon,
  UserIcon,
  MenuIcon,
  CloseIcon,
} from "@/app/components/nav/Icons";

const ThemeToggle = dynamic(() => import("@/app/components/theme/ThemeToggle"), { ssr: false });

type Item = { href: string; label: string; icon?: React.ReactNode; exact?: boolean };

const NAV_ITEMS: Item[] = [
  { href: "/home", label: "Inicio", icon: <HomeIcon />, exact: true },
  { href: "/feed", label: "Feed", icon: <FeedIcon /> },
  { href: "/paper", label: "Modo Demo", icon: <DemoIcon /> },
  { href: "/risk", label: "Perfil riesgo", icon: <RiskIcon /> },
  { href: "/invest/request", label: "Solicitud", icon: <InvestIcon /> },
  { href: "/simulator", label: "Simulador", icon: <SimIcon /> },
  { href: "/profile", label: "Perfil", icon: <UserIcon /> },
];

function isActive(path: string, item: Item) {
  if (item.exact) return path === item.href;
  return path === item.href || path.startsWith(item.href + "/");
}

function NavList({
  items,
  pathname,
  onNavigate,
}: {
  items: Item[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1">
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
              active ? "bg-white/15" : "hover:bg-white/10"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const session = await getSession();
      if (!mounted) return;
      setEmail(session?.email ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    setMobileOpen(false);
  }, [pathname]);

  async function doLogout() {
    await logout();
    router.replace("/");
  }

  const items = useMemo(() => NAV_ITEMS, []);

  return (
    <div className="min-h-dvh flex flex-col bg-[color:var(--background)] text-[color:var(--foreground)]">
      <header className="h-14 sm:h-16 border-b border-[color:var(--border)] bg-[color:var(--muted)] px-3 sm:px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setMobileOpen((value) => !value)}
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
          <Link href="/home" className="text-base font-semibold tracking-tight sm:text-lg">
            AURA
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {email && <span className="hidden sm:inline text-xs opacity-70">{email}</span>}
          <ThemeToggle className="btn-ghost btn-sm sm:btn" />
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
          <div className="nav-drawer h-full w-[300px] max-w-[88vw] bg-[color:var(--muted)] border-r border-[color:var(--border)] px-4 py-4 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between">
              <Link
                href="/home"
                className="text-base font-semibold"
                onClick={() => setMobileOpen(false)}
              >
                AURA
              </Link>
              <button
                type="button"
                className="btn btn-ghost"
                aria-label="Cerrar menú"
                onClick={() => setMobileOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>
            <NavList items={items} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <div className="space-y-2 border-t border-[color:var(--border)] pt-3">
              <ThemeToggle className="w-full" />
              <button type="button" className="btn w-full" onClick={doLogout}>
                Salir
              </button>
              <div className="truncate text-xs opacity-60">{email ?? "Usuario AURA"}</div>
            </div>
          </div>
          <button
            type="button"
            className="nav-backdrop flex-1 bg-black/40"
            aria-label="Cerrar menú"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      <main className="flex-1 pb-20 sm:pb-24">{children}</main>
      <BottomNav items={items} />
    </div>
  );
}

