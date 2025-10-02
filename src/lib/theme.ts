export type Theme = "night" | "day";
export const THEME_KEY = "aura:theme";

export function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return (v === "day" || v === "night") ? v : null;
  } catch { return null; }
}

export function applyTheme(t: Theme | null) {
  const root = document.documentElement;
  if (t === "day") root.setAttribute("data-theme", "day");
  else root.removeAttribute("data-theme"); // night por defecto
}

export function setTheme(t: Theme) {
  localStorage.setItem(THEME_KEY, t);
  applyTheme(t);
}
