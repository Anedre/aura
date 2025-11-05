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
      className="bottom-nav fixed bottom-0 inset-x-0 z-40"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom) + 4px)",
      }}
      aria-label="Barra de navegación inferior"
    >
      <ul className="bottom-nav__list">
        {mobileItems.map((it) => {
          const active = isActive(pathname, it);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={`bottom-nav__link ${active ? "bottom-nav__link--active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className={`bottom-nav__icon ${active ? "aura-animate-pop" : ""}`}>{it.icon}</span>
                <span className="leading-snug">{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

