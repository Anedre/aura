"use client";

import { useEffect, useState } from "react";
import { getStoredTheme, setTheme, applyTheme, type Theme } from "@/lib/theme";

export default function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>("night");

  useEffect(() => {
    // 1) aplica lo almacenado o respeta preferencia del SO
    const stored = getStoredTheme();
    if (stored) { setThemeState(stored); applyTheme(stored); return; }
    // Si el SO es light y no hay preferencia, activamos day
    const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)")?.matches;
    const initial = prefersLight ? "day" : "night";
    setThemeState(initial); applyTheme(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "night" ? "day" : "night";
    setThemeState(next);
    setTheme(next); // persiste y aplica
  }

  const label = theme === "night" ? "Cambiar a modo día" : "Cambiar a modo noche";
  const icon  = theme === "night" ? "☀️" : "🌙";

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost h-9 px-3"
      aria-label={label}
      title={label}
    >
      <span className="text-base leading-none">{icon}</span>
    </button>
  );
}
