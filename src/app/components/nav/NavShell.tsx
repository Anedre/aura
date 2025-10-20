"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { getSession, logout } from "@/lib/auth";
import BottomNav from "@/app/components/nav/BottomNav";
import { HomeIcon, FeedIcon, DemoIcon, RiskIcon, InvestIcon, SimIcon, UserIcon, MenuIcon, CloseIcon } from "@/app/components/nav/Icons";

const ThemeToggle = dynamic(() => import("@/app/components/theme/ThemeToggle"), { ssr: false });

type Item = { href: string; label: string; icon?: React.ReactNode; exact?: boolean };

const NAV_ITEMS: Item[] = [
  { href: "/home",  label: "Inicio",          icon: <HomeIcon />,  exact: true },
  { href: "/feed",  label: "Feed",            icon: <FeedIcon /> },
  { href: "/paper", label: "Modo Demo",       icon: <DemoIcon /> },
  { href: "/risk",  label: "Perfil riesgo",   icon: <RiskIcon /> },
  { href: "/invest/request", label: "Solicitud", icon: <InvestIcon /> },
  { href: "/simulator",     label: "Simulador",  icon: <SimIcon /> },
  { href: "/profile", label: "Perfil",        icon: <UserIcon /> },
];

function isActive(path: string, item: Item) {
  if (item.exact) return path === item.href;
  return path === item.href || path.startsWith(item.href + "/");
}

export default function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [openMobile, setOpenMobile] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const sess = await getSession();
      if (!alive) return;
      setEmail(sess?.email || null);
    })();
    return () => { alive = false; };
  }, []);

  async function doLogout() {
    await logout();
    router.replace("/");
  }

  const items = useMemo(() => NAV_ITEMS, []);

  return (
    <div className="min-h-dvh flex">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r border-[color:var(--border)] bg-[color:var(--muted)]">
        <div className="h-16 flex items-center px-4 border-b border-[color:var(--border)]">
          <Link href="/home" className="font-extrabold tracking-tight text-lg">AURA</Link>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {items.map((it) => {
            const active = isActive(pathname, it);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition ${active ? "bg-white/15" : "hover:bg-white/10"}`}
                onClick={() => setOpenMobile(false)}
              >
                <span className="text-base">{it.icon}</span>
                <span className="text-sm">{it.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[color:var(--border)] space-y-2">
          <ThemeToggle className="w-full" />
          <button className="btn w-full" onClick={doLogout}>Salir</button>
          <div className="text-xs opacity-60 truncate">{email ?? "Usuario AURA"}</div>
        </div>
      </aside>

      {/* Content + header */}
      <div className="flex-1 flex flex-col">
        {/* Header mobile */}
        <header className="md:hidden h-14 flex items-center justify-between px-3 border-b border-[color:var(--border)] bg-[color:var(--muted)]">
          <button className="btn" onClick={() => setOpenMobile(v => !v)} aria-label="Abrir menú">
            {openMobile ? <CloseIcon /> : <MenuIcon />}
          </button>
          <Link href="/home" className="font-bold">AURA</Link>
          <ThemeToggle />
        </header>

        {/* Drawer mobile */}
        {openMobile && (
          <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpenMobile(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-[color:var(--muted)] border-r border-[color:var(--border)] p-3">
              <div className="h-12 flex items-center justify-between">
                <Link href="/home" className="font-bold" onClick={() => setOpenMobile(false)}>AURA</Link>
                <button className="btn" onClick={() => setOpenMobile(false)} aria-label="Cerrar"><CloseIcon /></button>
              </div>
              <nav className="mt-2 space-y-1">
                {items.map((it) => {
                  const active = isActive(pathname, it);
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl transition ${active ? "bg-white/15" : "hover:bg-white/10"}`}
                      onClick={() => setOpenMobile(false)}
                    >
                      <span className="text-base">{it.icon}</span>
                      <span className="text-sm">{it.label}</span>
                    </Link>
                  );
                })}
              </nav>
              <div className="mt-4 space-y-2">
                <ThemeToggle className="w-full" />
                <button className="btn w-full" onClick={doLogout}>Salir</button>
                <div className="text-xs opacity-60 truncate">{email ?? "Usuario AURA"}</div>
              </div>
            </div>
          </div>
        )}

        {/* Main */}
        <main className="flex-1 md:ml-0 pb-16 md:pb-0">{children}</main>
        {/* Mobile bottom nav */}
        <BottomNav items={items} />
      </div>
    </div>
  );
}

