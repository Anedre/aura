export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_AURA_API || "")
  .replace(/\/+$/, ""); // normaliza: quita slash final
