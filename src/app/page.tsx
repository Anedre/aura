"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { apiFetch  } from "@/lib/api";


type Health = "ok" | "error" | "loading"

const SEED_SYMBOLS = [
  "BTC-USD","ETH-USD","SOL-USD","DOGE-USD",
  "AAPL","MSFT","NVDA","AMZN","SPY","QQQ",
  "EURUSD","XAUUSD"
]

// normaliza para búsquedas: quita guiones y baja a minúsculas
const norm = (s: string) => s.toLowerCase().replace(/[-_]/g, "")

export default function HomePage() {
  const router = useRouter()
  const [symbol, setSymbol] = useState("")
  const [feedHealth, setFeedHealth] = useState<Health>("loading")
  const [paperHealth, setPaperHealth] = useState<Health>("loading")

  // Autocomplete
  const [remoteSymbols, setRemoteSymbols] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_AURA_API || "").replace(/\/+$/, "");

  // Pings de salud + carga de símbolos para autocomplete desde el feed
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/v1/feed?horizon=1d&min_conf=0.55`, { cache: "no-store" });
        setFeedHealth(r.ok ? "ok" : "error");
        if (r.ok) {
          const json: unknown = await r.json();
          // ... (tu lógica de símbolos)
        }
      } catch {
        setFeedHealth("error");
      }
    })();

    (async () => {
      try {
        // <-- usa apiFetch para adjuntar Authorization: Bearer <ID_TOKEN>
        await apiFetch("/v1/paper_trade/list?limit=1");
        setPaperHealth("ok");
      } catch {
        setPaperHealth("error");
      }
    })();
  }, [API_BASE]);

  // mezclar símbolos (remotos + semilla), únicos y ordenados
  const allSymbols = useMemo(() => {
    const set = new Set<string>([...SEED_SYMBOLS, ...remoteSymbols].map(s => s.toUpperCase()))
    return Array.from(set).sort()
  }, [remoteSymbols])

  // calcular sugerencias
  const suggestions = useMemo(() => {
    const q = symbol.trim()
    if (!q) return allSymbols.slice(0, 10)
    const qn = norm(q)
    // prefijos primero, luego inclusiones
    const pref = allSymbols.filter(s => norm(s).startsWith(qn))
    const incl = allSymbols.filter(s => !norm(s).startsWith(qn) && norm(s).includes(qn))
    return [...pref, ...incl].slice(0, 10)
  }, [symbol, allSymbols])

  function goAsset(sym?: string) {
    const s = (sym ?? symbol).trim()
    if (!s) return
    setOpen(false)
    router.push(`/asset/${encodeURIComponent(s.toUpperCase())}`)
  }

  // manejo de teclado en input
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true)
      return
    }
    if (!open) {
      if (e.key === "Enter") goAsset()
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive(i => (i + 1) % Math.max(1, suggestions.length))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive(i => (i - 1 + Math.max(1, suggestions.length)) % Math.max(1, suggestions.length))
    } else if (e.key === "Enter") {
      e.preventDefault()
      goAsset(suggestions[active] ?? symbol)
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  // cerrar al hacer clic fuera
  useEffect(() => {
    function onDocClick(ev: MouseEvent) {
      if (!dropdownRef.current) return
      if (dropdownRef.current.contains(ev.target as Node)) return
      if (inputRef.current && inputRef.current.contains(ev.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  const pill = (h: Health) =>
    h === "ok" ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30" :
    h === "error" ? "bg-rose-500/10 text-rose-300 ring-rose-500/30" :
    "bg-slate-500/10 text-slate-300 ring-slate-500/30"

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
        {/* HERO */}
        <section className="text-center space-y-4">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            AURA — Recomendaciones de inversión con IA
          </h1>
          <p className="text-sm sm:text-base opacity-80 max-w-2xl mx-auto">
            Prototipo académico: señales CNN–LSTM con abstención por incertidumbre, stops por ATR y simulador
            de <em>paper trading</em> sobre arquitectura serverless (AWS).
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/feed"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 shadow"
            >
              📈 Ver Feed
            </Link>
            <Link
              href="/paper"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white shadow"
            >
              🧪 Paper Trading
            </Link>
          </div>
        </section>

        {/* BUSCADOR RÁPIDO + AUTOCOMPLETE */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20">
          <h2 className="text-sm font-semibold opacity-80 mb-3">Ir al detalle de un activo</h2>

          <div className="relative">
            <div className="flex gap-3">
              <input
                ref={inputRef}
                value={symbol}
                onChange={(e) => { setSymbol(e.target.value); setOpen(true); setActive(0) }}
                onKeyDown={onKeyDown}
                onFocus={() => setOpen(true)}
                placeholder="BTC-USD, ETH-USD, AAPL, SPY…"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-white/20"
                aria-autocomplete="list"
                role="combobox"
                aria-expanded={open}
                aria-controls="symbol-suggestions"
              />
              <button
                onClick={() => goAsset()}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10"
              >
                Abrir
              </button>
            </div>

            {open && suggestions.length > 0 && (
              <div
                id="symbol-suggestions"
                ref={dropdownRef}
                className="absolute z-50 mt-2 w-full rounded-xl border border-white/10 bg-black/70 backdrop-blur shadow-xl max-h-72 overflow-auto"
                role="listbox"
              >
                {suggestions.map((s, i) => (
                  <button
                    key={s}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => { e.preventDefault(); goAsset(s) }}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-white/5 hover:bg-white/10 ${
                      i === active ? "bg-white/10" : ""
                    }`}
                  >
                    <span className="font-semibold">{s}</span>
                    <span className="opacity-60 ml-2 text-xs">{norm(s).includes(norm(symbol.trim())) ? "Coincide" : ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="mt-2 text-xs opacity-60">Tip: escribe el símbolo (p. ej. “bt” → sugiere <strong>BTC-USD</strong>) y usa ↑/↓/Enter.</p>
        </section>

        {/* ESTADO DEL BACKEND */}
        <section className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-sm opacity-80 mb-2">Feed (/v1/feed)</div>
            <span className={`px-2 py-0.5 rounded-full text-xs ring-1 ${pill(feedHealth)}`}>
              {feedHealth === "ok" ? "OK" : feedHealth === "loading" ? "Verificando…" : "Error"}
            </span>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-sm opacity-80 mb-2">Paper Trading (/v1/paper_trade)</div>
            <span className={`px-2 py-0.5 rounded-full text-xs ring-1 ${pill(paperHealth)}`}>
              {paperHealth === "ok" ? "OK" : paperHealth === "loading" ? "Verificando…" : "Error"}
            </span>
          </div>
        </section>
      </div>
    </main>
  )
}
