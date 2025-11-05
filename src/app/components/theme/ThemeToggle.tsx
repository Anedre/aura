"use client";

import { useEffect, useState } from "react";
import { initTheme, toggleTheme, type Theme } from "@/lib/theme";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("night");
  useEffect(() => { setTheme(initTheme()); }, []);
  return (
    <button
      type="button"
      onClick={() => setTheme(toggleTheme())}
      className={`btn aura-pressable ${className}`}
      aria-label="Cambiar tema (Día/Noche)"
      aria-pressed={theme === "day"}
      title={theme === "day" ? "Cambiar a modo noche" : "Cambiar a modo día"}
    >
      <span className="text-lg leading-none">{theme === "day" ? "🌙" : "☀️"}</span>
      <span className="ml-2 hidden text-xs font-semibold tracking-tight opacity-80 sm:inline">
        {theme === "day" ? "Noche" : "Día"}
      </span>
    </button>
  );
}
