"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { fetchFeed, type FeedItem } from "@/lib/api"

type Horizon = "1d" | "1w"
type ActionFilter = "ALL" | "BUY" | "SELL" | "ABSTAIN"
type SortKey = "conf" | "sigma" | "date"

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ")
}

function ActionBadge({ action }: { action: FeedItem["action"] }) {
  const styles =
    action === "BUY" ? "text-emerald-300 ring-emerald-500/30 bg-emerald-500/10" :
    action === "SELL" ? "text-rose-300 ring-rose-500/30 bg-rose-500/10" :
    action === "ABSTAIN" ? "text-amber-300 ring-amber-500/30 bg-amber-500/10" :
    "text-slate-300 ring-slate-500/30 bg-slate-500/10"
  return (
    <span className={cn(
      "px-2 py-0.5 rounded-full text-xs font-semibold tracking-wide ring-1 shadow-sm backdrop-blur",
      styles
    )}>
      {action}
    </span>
  )
}

function pct(a?: number, b?: number) {
  if (a == null || b == null || b === 0) return null
  return ((a / b) - 1) * 100
}

function rrEst(tp?: number, sl?: number, px?: number) {
  const up = pct(tp, px)
  const dn = pct(sl, px)
  if (up == null || dn == null) return null
  const risk = Math.abs(dn)
  return risk > 0 ? up / risk : null
}

function Card({ item }: { item: FeedItem }) {
  const confPct = Math.round((item.p_conf ?? 0) * 100)
  const ts = item.ts ? new Date(item.ts) : new Date()
  const safeDate = ts.toLocaleString()
  const hasStops = !!item.stops && typeof item.stops?.tp === "number" && typeof item.stops?.sl === "number"
  const rTp = pct(item.stops?.tp, item.last_close ?? undefined)
  const rSl = pct(item.stops?.sl, item.last_close ?? undefined)
  const rr  = rrEst(item.stops?.tp, item.stops?.sl, item.last_close ?? undefined)

  return (
    <article className={cn(
      "rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
      "shadow-lg shadow-black/30 transition-colors duration-200"
    )}>
      <div className="p-5">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold tracking-wide">
              <Link href={`/asset/${item.symbol}`} className="hover:underline">{item.symbol}</Link>
            </h3>
            <ActionBadge action={item.action} />
          </div>
          <time className="text-xs opacity-70">{safeDate}</time>
        </header>

        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div><span className="opacity-70">σ: </span>{(item.sigma ?? 0).toFixed(3)}</div>
          <div><span className="opacity-70">Horizonte: </span>{item.horizon}</div>

          {item.action === "ABSTAIN" && (
            <div className="col-span-2 text-amber-300/90">
              <span className="opacity-70">Motivo: </span>
              {item.abstain_reason ?? `σ=${(item.sigma ?? 0).toFixed(3)} > ${item.sigma_limit ?? "σ_max"}`}
            </div>
          )}

          {hasStops && (
            <>
              <div>
                <span className="opacity-70">TP: </span>
                {item.stops!.tp.toFixed(4)}
                {rTp != null && <span className="opacity-60"> ({rTp.toFixed(2)}%)</span>}
              </div>
              <div>
                <span className="opacity-70">SL: </span>
                {item.stops!.sl.toFixed(4)}
                {rSl != null && <span className="opacity-60"> ({rSl.toFixed(2)}%)</span>}
              </div>
              {rr != null && (
                <div className="col-span-2 text-xs">
                  <span className="opacity-70">R/R estimado: </span>
                  <span className={rr >= 2 ? "text-emerald-300" : rr >= 1 ? "text-amber-300" : "text-rose-300"}>
                    {rr.toFixed(2)}x
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="opacity-70">Confianza</span>
            <span className="font-medium">{confPct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                item.action === "BUY" ? "bg-emerald-500" :
                item.action === "SELL" ? "bg-rose-500" :
                item.action === "ABSTAIN" ? "bg-amber-500" :
                "bg-slate-500"
              )}
              style={{ width: `${confPct}%` }}
            />
          </div>
        </div>

        <footer className="mt-4 text-xs opacity-60">
          modelo: {item.model_version ?? "—"}
        </footer>
      </div>
    </article>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 animate-pulse">
      <div className="h-4 w-24 bg-white/10 rounded" />
      <div className="mt-2 h-5 w-16 bg-white/10 rounded" />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="h-4 bg-white/10 rounded" />
        <div className="h-4 bg-white/10 rounded" />
        <div className="h-4 bg-white/10 rounded" />
        <div className="h-4 bg-white/10 rounded" />
      </div>
      <div className="mt-4 h-1.5 bg-white/10 rounded" />
    </div>
  )
}

export default function FeedPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [data, setData] = useState<FeedItem[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [horizon, setHorizon] = useState<Horizon>("1d")
  const [minConf, setMinConf] = useState<number>(0.55)
  const [action, setAction] = useState<ActionFilter>("ALL")
  const [q, setQ] = useState<string>("")
  const [sort, setSort] = useState<SortKey>("conf")
  const [onlyStops, setOnlyStops] = useState(false)
  const [tick, setTick] = useState(0)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  // init desde URL
  useEffect(() => {
    const h = (searchParams.get("h") as Horizon | null) ?? (searchParams.get("horizon") as Horizon | null)
    const m = searchParams.get("m") ?? searchParams.get("min_conf")
    const a = (searchParams.get("a") as ActionFilter | null)
    const s = (searchParams.get("s") as SortKey | null)
    const qq = searchParams.get("q")
    const os = searchParams.get("stops")

    if (h) setHorizon(h)
    if (m) setMinConf(Number(m) / (m.includes(".") ? 1 : 100))
    if (a) setAction(a)
    if (s) setSort(s)
    if (qq) setQ(qq)
    if (os) setOnlyStops(os === "1")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // escribe filtros a URL
  useEffect(() => {
    const qsp = new URLSearchParams(searchParams)
    qsp.set("h", horizon)
    qsp.set("m", String(Math.round(minConf * 100)))
    qsp.set("a", action)
    qsp.set("s", sort)
    if (q) qsp.set("q", q); else qsp.delete("q")
    qsp.set("stops", onlyStops ? "1" : "0")
    router.replace(`${pathname}?${qsp.toString()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizon, minConf, action, sort, q, onlyStops])

  // auto-refresh
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 90_000)
    return () => clearInterval(id)
  }, [])

  // fetch + fallback 1w->1d si viene vacío
  useEffect(() => {
    setData(null)
    setErr(null)
    fetchFeed({ horizon, min_conf: minConf })
      .then(d => {
        if (horizon === "1w" && Array.isArray(d) && d.length === 0) {
          console.info("[AURA] No hay 1w, cambiando a 1d")
          setHorizon("1d")
          return
        }
        setData(d)
        setUpdatedAt(new Date())
      })
      .catch(e => setErr(String(e)))
  }, [horizon, minConf, tick])

  const filtered = useMemo(() => {
    if (!Array.isArray(data)) return []
    const f = data.filter(d => {
      const passConf = (d.p_conf ?? 0) >= minConf
      const passAct = action === "ALL" ? true : d.action === action
      const passStops = onlyStops ? (d.stops && typeof d.stops.tp === "number" && typeof d.stops.sl === "number") : true
      const passQ = q ? d.symbol.toLowerCase().includes(q.toLowerCase()) : true
      return passConf && passAct && passStops && passQ
    })
    const sorted = [...f].sort((a, b) => {
      if (sort === "conf") return (b.p_conf ?? 0) - (a.p_conf ?? 0)
      if (sort === "sigma") return (a.sigma ?? 0) - (b.sigma ?? 0)
      if (sort === "date") return new Date(b.ts ?? 0).getTime() - new Date(a.ts ?? 0).getTime()
      return 0
    })
    return sorted
  }, [data, minConf, action, onlyStops, q, sort])

  const counts = useMemo(() => {
    const base = { BUY: 0, SELL: 0, ABSTAIN: 0 }
    if (!Array.isArray(data)) return base
    for (const d of data) { (base as any)[d.action] = ((base as any)[d.action] ?? 0) + 1 }
    return base
  }, [data])

  function exportCSV() {
    const rows = filtered.map(d => ({
      symbol: d.symbol,
      action: d.action,
      p_conf: d.p_conf,
      sigma: d.sigma,
      horizon: d.horizon,
      ts: d.ts,
      last_close: d.last_close ?? "",
      tp: d.stops?.tp ?? "",
      sl: d.stops?.sl ?? "",
      model_version: d.model_version ?? ""
    }))
    const headers = Object.keys(rows[0] ?? {
      symbol: "", action: "", p_conf: "", sigma: "", horizon: "", ts: "", last_close: "", tp: "", sl: "", model_version: ""
    })
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => String((r as any)[h] ?? "")).join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `aura_feed_${horizon}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (err) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <div className="max-w-4xl mx-auto p-6">
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200">
            <div className="font-semibold mb-1">Error consultando el feed</div>
            <div className="text-sm opacity-90">{err}</div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Feed de Recomendaciones</h1>
          <p className="text-sm opacity-70">Señales con confianza calibrada e incertidumbre (AURA CNN–LSTM).</p>
        </header>

        {/* FILTROS */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm opacity-80">Horizonte</label>
            <select
              value={horizon}
              onChange={(e) => setHorizon(e.target.value as Horizon)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm"
            >
              <option value="1d">1d</option>
              <option value="1w">1w</option>
            </select>
          </div>

          <div className="flex-1 min-w-56">
            <label className="flex items-center justify-between text-sm opacity-80">
              <span>Confianza mínima</span>
              <span className="font-medium">{Math.round(minConf * 100)}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(minConf * 100)}
              onChange={(e) => setMinConf(Number(e.target.value) / 100)}
              className="w-full accent-emerald-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm opacity-80">Acción</span>
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {(["ALL","BUY","SELL","ABSTAIN"] as ActionFilter[]).map(a => (
                <button
                  key={a}
                  onClick={() => setAction(a)}
                  className={cn(
                    "px-2 py-1 text-xs border-r border-white/10 last:border-r-0",
                    a === action ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm opacity-80">Orden</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm"
            >
              <option value="conf">Confianza ↓</option>
              <option value="sigma">σ (menor primero)</option>
              <option value="date">Recientes</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm opacity-90">
            <input
              type="checkbox"
              className="accent-emerald-400"
              checked={onlyStops}
              onChange={(e) => setOnlyStops(e.target.checked)}
            />
            solo con TP/SL
          </label>

          <div className="flex items-center gap-2">
            <input
              placeholder="Buscar símbolo…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { setHorizon("1d"); setMinConf(0.55); setAction("ALL"); setOnlyStops(false); setQ(""); setSort("conf"); }}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-sm"
              title="Volver a los valores por defecto"
            >
              Reset filtros
            </button>

            <button
              onClick={() => setTick(t => t + 1)}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-sm"
              title="Refrescar ahora"
            >
              Refrescar
            </button>
            <button
              onClick={exportCSV}
              className="px-3 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm"
              title="Exportar CSV de lo filtrado"
            >
              Exportar CSV
            </button>
          </div>
        </section>

        {/* CONTADORES */}
        <section className="flex flex-wrap gap-3 text-xs items-center">
          <span className="px-2 py-0.5 rounded-full ring-1 ring-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            BUY: {counts.BUY}
          </span>
          <span className="px-2 py-0.5 rounded-full ring-1 ring-rose-500/30 bg-rose-500/10 text-rose-300">
            SELL: {counts.SELL}
          </span>
          <span className="px-2 py-0.5 rounded-full ring-1 ring-amber-500/30 bg-amber-500/10 text-amber-300">
            ABSTAIN: {counts.ABSTAIN}
          </span>

          <span className="ml-2 opacity-70">
            Total bruto: {Array.isArray(data) ? data.length : 0} • Tras filtros: {filtered.length}
          </span>

          {updatedAt && (
            <span className="ml-auto opacity-70">
              Última actualización: {updatedAt.toLocaleTimeString()}
            </span>
          )}
        </section>

        {/* LISTA */}
        <section className="grid gap-4">
          {data === null && (<><SkeletonCard /><SkeletonCard /><SkeletonCard /></>)}

          {Array.isArray(data) && filtered.length > 0 && filtered.map((d, i) => (
            <Card key={`${d.symbol}-${i}`} item={d} />
          ))}

          {Array.isArray(data) && filtered.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm opacity-80 mb-2">
                No hay señales con confianza ≥ {Math.round(minConf*100)}% {onlyStops ? "y con TP/SL" : ""}.
                {Array.isArray(data) && data.length > 0 && <> Hay {data.length} señal(es) brutas disponibles.</>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setMinConf(0.55)}
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-sm"
                >
                  Bajar a 55%
                </button>
                <button
                  onClick={() => setMinConf(0)}
                  className="px-3 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm"
                >
                  Mostrar todo
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
