"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useSearchParams, useRouter, usePathname } from "next/navigation"
import { fetchAssetDetail, postPaperTrade, recommendByAsset, type AssetRecommendation } from "@/lib/api"

/* ---------- Tipos ---------- */
type Ohlcv = { t: string; o: number; h: number; l: number; c: number; v?: number }
type Signal = {
  ts: string
  action: "BUY" | "SELL" | "ABSTAIN" | "HOLD"
  p_conf?: number
  sigma?: number
  band_low?: number
  band_high?: number
}
type Detail = {
  symbol: string
  horizon?: string
  ohlcv?: Ohlcv[]
  signals?: Signal[]
  stops?: { tp: number; sl: number } | null
  last_close?: number | null
}

/* ---------- Utils ---------- */
const isFiniteNum = (x: any): x is number => typeof x === "number" && Number.isFinite(x)
const fmt = (n: number | null | undefined, d = 2) => (isFiniteNum(Number(n)) ? Number(n).toFixed(d) : "—")
function clsAction(a: Signal["action"]) {
  return a === "BUY" ? { stroke: "stroke-emerald-400", fill: "fill-emerald-400" } :
         a === "SELL" ? { stroke: "stroke-rose-400",    fill: "fill-rose-400" } :
         a === "ABSTAIN" ? { stroke: "stroke-amber-400", fill: "fill-amber-400" } :
         { stroke: "stroke-slate-400", fill: "fill-slate-400" }
}
const toSide = (a?: Signal["action"]) => (a === "BUY" ? "BUY" : a === "SELL" ? "SELL" : undefined) as ("BUY"|"SELL"|undefined)
const nearestIndex = (tsISO: string, arr: Ohlcv[]) => {
  const t = new Date(tsISO).getTime()
  if (!Number.isFinite(t) || arr.length === 0) return 0
  let best = 0, bestAbs = Infinity
  for (let i = 0; i < arr.length; i++) {
    const ti = new Date(arr[i].t).getTime()
    const dt = Math.abs(ti - t)
    if (dt < bestAbs) { bestAbs = dt; best = i }
  }
  return best
}
function signalBands(sig: Signal): { lowF: number; highF: number } | null {
  if (isFiniteNum(sig.band_low) && isFiniteNum(sig.band_high) && sig.band_low! > 0 && sig.band_high! > 0) {
    return { lowF: sig.band_low!, highF: sig.band_high! }
  }
  const s = Math.max(0, Math.min(0.25, Number(sig.sigma) || 0))
  return { lowF: 1 - s, highF: 1 + s }
}

/* ---------- Chart interactivo (SVG) ---------- */
function LineChart({
  data, signals, onPickPrice
}: { data: Ohlcv[]; signals: Signal[]; onPickPrice?: (price: number, side?: "BUY" | "SELL") => void }) {
  const width = 980, height = 320, pad = 28
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const ys = useMemo(() => data.map(d => Number(d.c)).filter(isFiniteNum), [data])
  const minY = ys.length ? Math.min(...ys) : 0
  const maxY = ys.length ? Math.max(...ys) : 1
  const span = Math.max(1e-6, maxY - minY)

  const x = (i: number) => pad + i * ((width - 2 * pad) / Math.max(1, data.length - 1))
  const y = (v: number) => height - pad - ((v - minY) / span) * (height - 2 * pad)

  const path = useMemo(() => {
    if (data.length === 0) return ""
    return data.map((d, i) => `${i ? "L" : "M"} ${x(i).toFixed(2)} ${y(Number(d.c)||0).toFixed(2)}`).join(" ")
  }, [data, span])

  function idxFromClientX(clientX: number) {
    const box = svgRef.current?.getBoundingClientRect()
    if (!box) return null
    const rel = Math.min(Math.max(clientX - box.left - pad, 0), (width - 2*pad))
    const ratio = (data.length - 1) > 0 ? rel / (width - 2*pad) : 0
    return Math.round(ratio * (data.length - 1))
  }
  function onMove(e: React.MouseEvent<SVGSVGElement>) { const idx = idxFromClientX(e.clientX); if (idx != null) setHoverIdx(idx) }
  function onLeave() { setHoverIdx(null) }
  function onClick(e: React.MouseEvent<SVGSVGElement>) {
    const idx = idxFromClientX(e.clientX); if (idx == null) return
    const c = Number(data[idx]?.c); if (isFiniteNum(c)) onPickPrice?.(c)
  }

  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto rounded-xl border border-white/10 bg-white/[0.02] cursor-crosshair"
        onMouseMove={onMove} onMouseLeave={onLeave} onClick={onClick}>
        {[minY, minY+span/2, maxY].map((ty,i)=>(
          <g key={i}>
            <line x1={pad} y1={y(ty)} x2={width-pad} y2={y(ty)} stroke="currentColor" opacity="0.08"/>
            <text x={pad-6} y={y(ty)} textAnchor="end" dominantBaseline="middle" className="fill-white/60 text-[10px]">{fmt(ty)}</text>
          </g>
        ))}
        <line x1={pad} y1={pad} x2={pad} y2={height-pad} stroke="currentColor" opacity="0.12"/>
        {path && <path d={`${path} L ${width-pad} ${height-pad} L ${pad} ${height-pad} Z`} className="fill-white/10" />}
        {path && <path d={path} className="stroke-white" strokeWidth="1.6" fill="none" />}
        {signals.map((s, idx) => {
          const i = nearestIndex(s.ts, data); const bar = data[i]; if (!bar) return null
          const cx = x(i); const c = Number(bar.c); if (!isFiniteNum(c)) return null
          const bands = signalBands(s); const color = clsAction(s.action)
          return (
            <g key={idx} className="opacity-90" onClick={(e)=>{ e.stopPropagation(); onPickPrice?.(c, toSide(s.action)) }}>
              <line x1={cx} y1={pad} x2={cx} y2={height-pad} className={`${color.stroke}`} strokeWidth={0.75} opacity={0.28}/>
              {bands && <>
                <line x1={cx} y1={y(c*bands.highF)} x2={cx} y2={y(c*bands.lowF)} className={`${color.stroke}`} strokeWidth={2}/>
                <line x1={cx-6} y1={y(c*bands.highF)} x2={cx+6} y2={y(c*bands.highF)} className={`${color.stroke}`} strokeWidth={2}/>
                <line x1={cx-6} y1={y(c*bands.lowF)}  x2={cx+6} y2={y(c*bands.lowF)}  className={`${color.stroke}`} strokeWidth={2}/>
              </>}
              <circle cx={cx} cy={y(c)} r={3.5} className={`${color.fill}`} />
            </g>
          )
        })}
        {hoverIdx != null && data[hoverIdx] && (
          <>
            <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={pad} y2={height-pad} stroke="currentColor" opacity="0.35"/>
            <circle cx={x(hoverIdx)} cy={y(Number(data[hoverIdx].c)||0)} r={3} className="fill-white" />
          </>
        )}
      </svg>
      {hoverIdx != null && data[hoverIdx] && (
        <div className="absolute top-2 left-2 rounded-lg bg-black/80 text-white text-xs px-2 py-1 border border-white/10 pointer-events-none">
          <div>{new Date(data[hoverIdx].t).toLocaleString()}</div>
          <div>O:{fmt(data[hoverIdx].o,4)} H:{fmt(data[hoverIdx].h,4)} L:{fmt(data[hoverIdx].l,4)} C:{fmt(data[hoverIdx].c,4)}</div>
          <div className="opacity-70">Clic para usar el precio</div>
        </div>
      )}
    </div>
  )
}

/* ---------- Simulador ---------- */
function Simulate({ symbol, lastPrice, externalPrice, externalSide }: {
  symbol: string; lastPrice: number; externalPrice?: number | null; externalSide?: "BUY" | "SELL" | undefined
}) {
  const [user, setUser] = useState("demo")
  const [qty, setQty] = useState(1)
  const [price, setPrice] = useState(externalPrice ?? lastPrice)
  const [fees, setFees] = useState(10)
  const [slip, setSlip] = useState(5)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => { try { const u = localStorage.getItem("aura:user"); if (u) setUser(u) } catch {} }, [])
  useEffect(() => { try { localStorage.setItem("aura:user", user) } catch {} }, [user])
  useEffect(() => { if (externalPrice != null) setPrice(externalPrice) }, [externalPrice])
  useEffect(() => { if (price == null) setPrice(lastPrice) }, [lastPrice])

  const norm = (n: any, fb = 0) => (Number.isFinite(Number(n)) ? Number(n) : fb)
  async function doTrade(side: "BUY"|"SELL") {
    setMsg("Enviando…")
    try {
      const res = await postPaperTrade({
        user, symbol, side, qty: norm(qty, 0), price: norm(price, lastPrice),
        fees_bp: norm(fees, 0), slippage_bp: norm(slip, 0),
      })
      setMsg(`OK ${side} @ ${res.effective_price.toFixed(4)} (efectivo). Ver en Paper.`)
    } catch (e: any) { setMsg(`Error: ${e?.message ?? String(e)}`) }
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
      <h2 className="text-sm font-semibold opacity-80">Simular trade (paper)</h2>
      {externalSide && <div className="text-xs opacity-80 -mt-1">Sugerencia desde Feed: <b>{externalSide}</b> @ {fmt(externalPrice,4)}</div>}
      <div className="grid sm:grid-cols-6 gap-3 text-sm">
        <label className="flex items-center gap-2">Usuario
          <input value={user} onChange={e=>setUser(e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 w-full" />
        </label>
        <label className="flex items-center gap-2">Qty
          <input type="number" min={0.0001} step="any" value={qty} onChange={e=>setQty(Number(e.target.value))}
                 className="bg-white/5 border border-white/10 rounded px-2 py-1 w-full"/>
        </label>
        <label className="flex items-center gap-2">Precio
          <input type="number" step="any" value={price} onChange={e=>setPrice(Number(e.target.value))}
                 className="bg-white/5 border border-white/10 rounded px-2 py-1 w-full"/>
        </label>
        <label className="flex items-center gap-2">Fees (bps)
          <input type="number" step="any" value={fees} onChange={e=>setFees(Number(e.target.value))}
                 className="bg-white/5 border border-white/10 rounded px-2 py-1 w-full"/>
        </label>
        <label className="flex items-center gap-2">Slippage (bps)
          <input type="number" step="any" value={slip} onChange={e=>setSlip(Number(e.target.value))}
                 className="bg-white/5 border border-white/10 rounded px-2 py-1 w-full"/>
        </label>
        <div className="flex items-center gap-2">
          <button onClick={()=>doTrade("BUY")}  className="px-3 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white">BUY</button>
          <button onClick={()=>doTrade("SELL")} className="px-3 py-1 rounded bg-rose-600/80   hover:bg-rose-600   text-white">SELL</button>
        </div>
      </div>
      {msg && <p className="text-xs opacity-80">{msg} <a href="/paper" className="underline">Ir a Paper</a></p>}
    </section>
  )
}

/* ---------- Stops ---------- */
function Stops({ last, stops }: { last?: number | null; stops?: {tp:number; sl:number} | null }) {
  if (!isFiniteNum(Number(last)) || !stops?.tp || !stops?.sl) return null
  const up = ((stops.tp / Number(last)) - 1) * 100
  const dn = ((stops.sl / Number(last)) - 1) * 100
  const rr = Math.abs(dn) > 0 ? up / Math.abs(dn) : null
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm">
      <h2 className="text-sm font-semibold opacity-80 mb-2">TP / SL sugeridos</h2>
      <div className="grid sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-white/5 border border-white/10 p-2">
          <div className="text-[11px] opacity-70">Último</div>
          <div className="text-base font-semibold">{fmt(last, 4)}</div>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 p-2">
          <div className="text-[11px] opacity-70">TP</div>
          <div className="text-base font-semibold">{fmt(stops.tp, 4)} <span className="text-xs opacity-70">({fmt(up,2)}%)</span></div>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 p-2">
          <div className="text-[11px] opacity-70">SL</div>
          <div className="text-base font-semibold">{fmt(stops.sl, 4)} <span className="text-xs opacity-70">({fmt(dn,2)}%)</span></div>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 p-2">
          <div className="text-[11px] opacity-70">R/R estimado</div>
          <div className={`text-base font-semibold ${rr!=null ? (rr>=2 ? "text-emerald-300" : rr>=1 ? "text-amber-300" : "text-rose-300") : ""}`}>
            {rr!=null ? `${rr.toFixed(2)}x` : "—"}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- Página ---------- */
export default function AssetDetailPage() {
  const { symbol } = useParams<{ symbol: string }>()
  const search = useSearchParams()
  const router = useRouter(); const pathname = usePathname()

  const [bars, setBars] = useState<number>(() => {
    const w = Number(search.get("w")); return Number.isFinite(w) && w > 0 ? w : 120
  })
  const [data, setData] = useState<Detail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // recomendación por activo
  const [rec, setRec] = useState<AssetRecommendation | null>(null)
  const [recLoading, setRecLoading] = useState(false)
  const [recErr, setRecErr] = useState<string | null>(null)

  // prefill desde query
  const initialPickedSide = useMemo(() => {
    const s = search.get("side"); return s === "BUY" || s === "SELL" ? (s as "BUY"|"SELL") : undefined
  }, [search])
  const initialPickedPrice = useMemo(() => {
    const p = Number(search.get("price")); return Number.isFinite(p) ? p : undefined
  }, [search])

  const [pickedPrice, setPickedPrice] = useState<number | undefined>(initialPickedPrice)
  const [pickedSide, setPickedSide]   = useState<"BUY"|"SELL"|undefined>(initialPickedSide)

  useEffect(() => { setPickedPrice(initialPickedPrice) }, [initialPickedPrice])
  useEffect(() => { setPickedSide(initialPickedSide) }, [initialPickedSide])

  // sync rango en URL
  useEffect(() => {
    const q = new URLSearchParams(search); q.set("w", String(bars))
    router.replace(`${pathname}?${q.toString()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars])

  // carga del detalle
  useEffect(() => {
    setLoading(true); setErr(null)
    fetchAssetDetail(symbol, bars)
      .then(d => setData(d as unknown as Detail))
      .catch(e => setErr(String(e)))
      .finally(()=>setLoading(false))
  }, [symbol, bars])

  function handlePickPrice(p: number, side?: "BUY"|"SELL") {
    setPickedPrice(p); if (side) setPickedSide(side)
  }

  async function askRecommendation() {
    setRec(null); setRecErr(null); setRecLoading(true)
    try {
      const r = await recommendByAsset(symbol)
      setRec(r)
    } catch (e:any) {
      setRecErr(String(e?.message ?? e))
    } finally {
      setRecLoading(false)
    }
  }

  if (err) return <div className="p-6 text-rose-400">Error: {err}</div>
  if (loading || !data) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <div className="max-w-5xl mx-auto p-6 space-y-4">
          <div className="h-6 w-48 bg-white/10 rounded animate-pulse" />
          <div className="h-80 w-full bg-white/5 rounded-xl border border-white/10 animate-pulse" />
          <div className="h-28 w-full bg-white/5 rounded-xl border border-white/10 animate-pulse" />
        </div>
      </main>
    )
  }

  const series = Array.isArray(data.ohlcv) ? data.ohlcv.filter(d => isFiniteNum(d?.c)) : []
  const sigs   = Array.isArray(data.signals) ? data.signals : []
  const last   = series.at(-1)?.c ?? Number(data.last_close ?? 0) ?? 0

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h1 className="text-2xl font-bold">{(data.symbol || symbol).toUpperCase()} — Detalle</h1>
            <div className="flex items-center gap-2 text-xs opacity-70">
              {data.horizon && <span className="px-2 py-0.5 rounded-full ring-1 ring-white/15 bg-white/5">Ritmo: {data.horizon}</span>}
              <span className="px-2 py-0.5 rounded-full ring-1 ring-white/15 bg-white/5">Último: {fmt(last, 4)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm opacity-80">Rango</span>
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {[30, 60, 120].map(n => (
                <button key={n} onClick={() => setBars(n)}
                        className={`px-2 py-1 text-xs border-r border-white/10 last:border-r-0 ${bars===n ? "bg-white/15" : "bg-white/5 hover:bg-white/10"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </header>

        <LineChart data={series} signals={sigs} onPickPrice={handlePickPrice} />

        {/* Bloque de recomendación por activo */}
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold opacity-80">Recomendación por activo</h2>
            <button onClick={askRecommendation}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-sm">
              {recLoading ? "Consultando…" : "Solicitar recomendación"}
            </button>
          </div>
          {recErr && <div className="text-xs text-rose-300">{recErr}</div>}
          {rec && (
            <div className="grid sm:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg bg-white/5 border border-white/10 p-2">
                <div className="text-[11px] opacity-70">Acción</div>
                <div className={`text-base font-semibold ${
                  rec.action === "BUY" ? "text-emerald-300" :
                  rec.action === "SELL" ? "text-rose-300" : "text-amber-300"
                }`}>{rec.action}</div>
              </div>
              <div className="rounded-lg bg-white/5 border border-white/10 p-2">
                <div className="text-[11px] opacity-70">Confianza</div>
                <div className="text-base font-semibold">{rec.p_conf!=null ? `${Math.round(rec.p_conf*100)}%` : "—"}</div>
              </div>
              <div className="rounded-lg bg-white/5 border border-white/10 p-2">
                <div className="text-[11px] opacity-70">TP</div>
                <div className="text-base font-semibold">{fmt(rec.stops?.tp, 4)}</div>
              </div>
              <div className="rounded-lg bg-white/5 border border-white/10 p-2">
                <div className="text-[11px] opacity-70">SL</div>
                <div className="text-base font-semibold">{fmt(rec.stops?.sl, 4)}</div>
              </div>
              <div className="sm:col-span-4">
                <button
                  onClick={()=>{ setPickedSide(rec.action === "BUY" ? "BUY" : rec.action === "SELL" ? "SELL" : undefined); setPickedPrice(last) }}
                  disabled={rec.action === "ABSTAIN"}
                  className="px-3 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm">
                  Aplicar al simulador
                </button>
              </div>
            </div>
          )}
          {!rec && !recLoading && <p className="text-xs opacity-70">Pide una recomendación para este símbolo. Si el backend no tiene endpoint, se usa un fallback desde el feed 1d.</p>}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
          <h2 className="text-sm font-semibold opacity-80">Señales</h2>
          {sigs.length > 0
            ? <p className="text-xs opacity-70">Clic en una señal para usar su precio/side en el simulador.</p>
            : <p className="text-sm opacity-70">Sin señales recientes.</p>}
        </section>

        <Stops last={last} stops={data.stops ?? null} />

        <Simulate symbol={(data.symbol || symbol).toUpperCase()} lastPrice={last}
                  externalPrice={pickedPrice} externalSide={pickedSide} />
      </div>
    </main>
  )
}
