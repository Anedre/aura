"use client";

import { useEffect, useState } from "react";
import { initTheme, toggleTheme, type Theme } from "@/lib/theme";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("night");
  useEffect(() => { setTheme(initTheme()); }, []);
  return (
    <button
      onClick={() => setTheme(toggleTheme())}
      className={`btn ${className}`}
      aria-label="Cambiar tema (Día/Noche)"
      title={theme === "day" ? "Cambiar a modo noche" : "Cambiar a modo día"}
    >
      <span className="text-lg">{theme === "day" ? "🌙" : "☀️"}</span>
      <span className="ml-2 text-sm opacity-80 hidden sm:inline">{theme === "day" ? "Noche" : "Día"}</span>
    </button>
  );
}
