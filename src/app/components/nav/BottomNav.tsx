"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";

type Item = { href: string; label: string; icon?: React.ReactNode; exact?: boolean };

function isActive(path: string, item: Item) {
  if (item.exact) return path === item.href;
  return path === item.href || path.startsWith(item.href + "/");
}

export default function BottomNav({ items }: { items: Item[] }) {
  const pathname = usePathname();
  // Minimal set for bottom bar
  const showHrefs = new Set(["/home", "/feed", "/paper", "/simulator", "/profile"]);
  const mobileItems = items.filter((i) => showHrefs.has(i.href));
  if (mobileItems.length === 0) return null;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t border-[color:var(--border)]"
      style={{
        background: "color-mix(in oklab, var(--muted) 92%, transparent)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Barra de navegación inferior"
    >
      <ul className="mx-auto grid max-w-[520px] grid-cols-5">
        {mobileItems.map((it) => {
          const active = isActive(pathname, it);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={`flex flex-col items-center justify-center py-2 text-[11px] gap-1 transition ${
                  active ? "text-white" : "text-white/75 hover:text-white"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span className={`p-1.5 rounded-lg ${active ? "bg-white/15" : "bg-white/5"}`}>{it.icon}</span>
                <span className="leading-none">{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

