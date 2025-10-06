// src/lib/theme.ts
export type Theme = "day" | "night";
const KEY = "aura_theme";

function prefersLight(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

export function getSavedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY) as Theme | null;
    return v === "day" || v === "night" ? v : null;
  } catch { return null; }
}

export function applyTheme(t: Theme) {
  const el = document.documentElement;
  if (t === "day") el.setAttribute("data-theme", "day");
  else el.removeAttribute("data-theme");
  try { localStorage.setItem(KEY, t); } catch {}
}

export function initTheme(): Theme {
  const t = getSavedTheme() ?? (prefersLight() ? "day" : "night");
  applyTheme(t);
  return t;
}

export function toggleTheme(): Theme {
  const current: Theme = document.documentElement.getAttribute("data-theme") === "day" ? "day" : "night";
  const next: Theme = current === "day" ? "night" : "day";
  applyTheme(next);
  return next;
}
