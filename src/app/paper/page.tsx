"use client"

 import { useEffect, useMemo, useState, useCallback } from "react"
 import {
  fetchPaperSummary,
  postPaperTrade,
  type PaperTrade,
  type PaperKPIs,
} from "@/lib/api.paper";

type Side = "BUY" | "SELL"
type SortKey = "ts_desc" | "ts_asc" | "symbol" | "side"

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {hint && <div className="text-[11px] opacity-60 mt-1">{hint}</div>}
    </div>
  )
}

function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ")
}

/** --- Equity series (acumulado por trade, aproximado) --- */
function buildEquitySeries(trades: PaperTrade[]): Array<{ t: string; eq: number }> {
  const rows = [...trades].sort((a,b)=> new Date(a.ts).getTime() - new Date(b.ts).getTime())
  type Pos = { qty: number; avg_px: number }
  const pos: Record<string, Pos> = {}
  let eq = 0
  const series: Array<{ t: string; eq: number }> = []

  for (const tr of rows) {
    const sym = tr.symbol.toUpperCase()
    const px = Number(tr.effective_price ?? tr.price ?? 0)
    const q = Number(tr.qty ?? 0) * (tr.side === "BUY" ? 1 : -1)
    const isBuy = q > 0
    const cur = pos[sym] ?? { qty: 0, avg_px: 0 }

    if ((cur.qty >= 0 && isBuy) || (cur.qty <= 0 && !isBuy)) {
      const newQty = cur.qty + q
      const totalCost = cur.avg_px * Math.abs(cur.qty) + px * Math.abs(q)
      cur.avg_px = newQty !== 0 ? totalCost / Math.abs(newQty) : 0
      cur.qty = newQty
      pos[sym] = cur
    } else {
      const crossQty = Math.min(Math.abs(cur.qty), Math.abs(q)) * (q > 0 ? 1 : -1)
      eq += (px - cur.avg_px) * (-crossQty)
      series.push({ t: tr.ts, eq })
      const remaining = cur.qty + q
      pos[sym] = remaining === 0 ? { qty: 0, avg_px: 0 } : { qty: remaining, avg_px: cur.avg_px }
    }
  }
  // si no hubo cierres, igual deja un punto base
  if (series.length === 0) series.push({ t: rows[0]?.ts ?? new Date().toISOString(), eq: 0 })
  return series
}

function EquityChart({ data }: { data: Array<{ t: string; eq: number }> }) {
  // simple SVG line
  const width = 980, height = 240, pad = 28
  if (!data || data.length === 0) {
    return <div className="h-40 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm opacity-70">
      Aún no hay puntos de equity (necesitas cerrar operaciones).
    </div>
  }
  const ys = data.map(d=>d.eq)
  const minY = Math.min(...ys, 0)
  const maxY = Math.max(...ys, 0)
  const spanY = Math.max(1e-6, maxY - minY)
  const x = (i:number)=> pad + i * ((width - 2*pad) / Math.max(1, data.length - 1))
  const y = (v:number)=> height - pad - ((v - minY) / spanY) * (height - 2*pad)
  const path = data.map((d,i)=> `${i?"L":"M"} ${x(i).toFixed(2)} ${y(d.eq).toFixed(2)}`).join(" ")

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto rounded-xl border border-white/10 bg-white/[0.02]">
      {[minY, (minY+maxY)/2, maxY].map((ty,i)=>(
        <g key={i}>
          <line x1={pad} y1={y(ty)} x2={width-pad} y2={y(ty)} stroke="currentColor" opacity="0.08"/>
          <text x={pad-6} y={y(ty)} textAnchor="end" dominantBaseline="middle" className="fill-white/60 text-[10px]">
            {ty.toFixed(2)}
          </text>
        </g>
      ))}
      <line x1={pad} y1={pad} x2={pad} y2={height-pad} stroke="currentColor" opacity="0.12"/>
      {path && <path d={`${path}`} className="stroke-emerald-400" strokeWidth="1.6" fill="none" />}
      {path && <path d={`${path} L ${width-pad} ${height-pad} L ${pad} ${height-pad} Z`} className="fill-emerald-400/10" />}
    </svg>
  )
}

export default function Paper() {
  const [rows, setRows] = useState<PaperTrade[] | null>(null)
  const [kpis, setKpis] = useState<PaperKPIs | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [user, setUser] = useState<string>("demo")
  const [loading, setLoading] = useState<boolean>(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  // filtros/orden
  const [qSymbol, setQSymbol] = useState("")
  const [sideFilter, setSideFilter] = useState<Side | "ALL">("ALL")
  const [sort, setSort] = useState<SortKey>("ts_desc")
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false)

  // modal nuevo trade
  const [showNew, setShowNew] = useState(false)
  const [ntSymbol, setNtSymbol] = useState("BTC-USD")
  const [ntSide, setNtSide] = useState<Side>("BUY")
  const [ntQty, setNtQty] = useState<number>(0.1)
  const [ntPrice, setNtPrice] = useState<number>(61000)
  const [ntFees, setNtFees] = useState<number>(10)
  const [ntSlip, setNtSlip] = useState<number>(15)
  const [posting, setPosting] = useState(false)
  const [postMsg, setPostMsg] = useState<string | null>(null)

  // persistir usuario
  useEffect(() => { try { const u = localStorage.getItem("aura:user"); if (u) setUser(u) } catch {} }, [])
  useEffect(() => { try { localStorage.setItem("aura:user", user) } catch {} }, [user])

  const load = useCallback(async () => {
    try {
      setLoading(true); setErr(null)
      const { trades, kpis } = await fetchPaperSummary(user, 500)
      setRows(trades ?? [])
      setKpis(kpis ?? {
        realized_pnl: 0, trades_closed: 0, max_drawdown: 0, sharpe: 0,
        open_positions: [], n_trades: (trades ?? []).length
      })
      setUpdatedAt(new Date())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => load(), 60_000)
    return () => clearInterval(id)
  }, [autoRefresh, load])


  // equity
  const equity = useMemo(() => buildEquitySeries(rows ?? []), [rows])

  // filtros/orden client
  const filtered = useMemo(() => {
    if (!Array.isArray(rows)) return []
    let out = rows
    if (qSymbol.trim()) {
      const q = qSymbol.trim().toLowerCase()
      out = out.filter(r => r.symbol.toLowerCase().includes(q))
    }
    if (sideFilter !== "ALL") out = out.filter(r => r.side === sideFilter)
    if (sort === "ts_desc") out = [...out].sort((a,b)=> new Date(b.ts).getTime() - new Date(a.ts).getTime())
    else if (sort === "ts_asc") out = [...out].sort((a,b)=> new Date(a.ts).getTime() - new Date(b.ts).getTime())
    else if (sort === "symbol") out = [...out].sort((a,b)=> a.symbol.localeCompare(b.symbol))
    else if (sort === "side") {
      const rank: Record<Side, number> = { BUY: 0, SELL: 1 }
      out = [...out].sort((a,b)=> rank[a.side as Side] - rank[b.side as Side])
    }
    return out
  }, [rows, qSymbol, sideFilter, sort])

  function exportCSV() {
    const headers = ["ts","symbol","side","qty","price","effective_price","fees_bp","slippage_bp","trade_id","user"]
    const lines = [headers.join(",")]
    for (const r of filtered) {
      lines.push([r.ts,r.symbol,r.side,r.qty,r.price,r.effective_price,r.fees_bp,r.slippage_bp,r.trade_id,r.user].join(","))
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob); const a = document.createElement("a")
    a.href = url; a.download = `paper_trades_${user}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  function exportEquityCSV() {
    const headers = ["ts","equity"]
    const lines = [headers.join(","), ...equity.map(p => `${p.t},${p.eq}`)]
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob); const a = document.createElement("a")
    a.href = url; a.download = `equity_${user}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  async function submitNewTrade(e: React.FormEvent) {
    e.preventDefault(); setPosting(true); setPostMsg(null)
    try {
      await postPaperTrade({
        user, symbol: ntSymbol.trim().toUpperCase(), side: ntSide,
        qty: Number(ntQty), price: Number(ntPrice),
        fees_bp: Number(ntFees), slippage_bp: Number(ntSlip),
      })
      setPostMsg("Operación creada ✅"); setShowNew(false); await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setPostMsg(`Error: ${msg}`)
      }
    finally { setPosting(false); setTimeout(()=> setPostMsg(null), 3500) }
  }

  if (err) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <div className="max-w-5xl mx-auto p-6">
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200">
            <div className="font-semibold mb-1">Error consultando paper trading</div>
            <div className="text-sm opacity-90">{err}</div>
          </div>
        </div>
      </main>
    )
  }
  if (loading) return <div className="p-6">Cargando…</div>

  const hasTrades = !!rows && rows.length > 0

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Paper trading — Resumen</h1>
            <p className="text-sm opacity-70">PnL neto (fees+slippage), drawdown, Sharpe y equity curve por trade.</p>
            {updatedAt && <div className="text-xs opacity-60 mt-1">Última actualización: {updatedAt.toLocaleTimeString()}</div>}
            {postMsg && <div className="text-xs mt-1">{postMsg}</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={user} onChange={(e)=>setUser(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm" placeholder="usuario (ej. demo)" />
            <button onClick={()=>load()} className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-sm">Refrescar</button>
            <label className="flex items-center gap-2 text-xs opacity-90 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
              <input type="checkbox" className="accent-emerald-400" checked={autoRefresh} onChange={(e)=>setAutoRefresh(e.target.checked)} />
              Auto-refresh (60s)
            </label>
            <button onClick={()=>setShowNew(true)} className="px-3 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm">+ Nuevo trade</button>
            <button onClick={exportCSV} className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-sm">Exportar CSV</button>
          </div>
        </header>

        {/* KPIs */}
        <section className="sticky top-[64px] z-10 backdrop-blur bg-black/30 rounded-xl border border-white/10 p-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="PnL neto" value={`${kpis!.realized_pnl.toFixed(2)}`} hint="Cerradas netas" />
            <Stat label="Max Drawdown" value={`${kpis!.max_drawdown.toFixed(2)}`} hint="Equity acumulada" />
            <Stat label="Sharpe (per-trade)" value={`${kpis!.sharpe.toFixed(2)}`} hint="Rendimiento por match" />
            <Stat label="Operaciones" value={`${kpis!.n_trades}`} hint={`Cerradas: ${kpis!.trades_closed}`} />
          </div>
        </section>

        {/* Equity curve */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold opacity-80">Equity acumulada</h2>
            <button onClick={exportEquityCSV} className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-xs">
              Descargar CSV
            </button>
          </div>
          <EquityChart data={equity} />
        </section>

        {/* Posiciones abiertas */}
        <section className="rounded-xl border border-white/10 p-4 bg-white/[0.02]">
          <h2 className="text-sm font-semibold opacity-80 mb-2">Posiciones abiertas</h2>
          {kpis!.open_positions.length === 0 ? (
            <div className="text-sm opacity-70">Sin posiciones abiertas.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr className="text-left"><th className="p-2">Símbolo</th><th className="p-2">Qty neta</th><th className="p-2">Precio medio efectivo</th></tr>
                </thead>
                <tbody>
                  {kpis!.open_positions.map((p) => (
                    <tr key={p.symbol} className="border-t border-white/10">
                      <td className="p-2">{p.symbol}</td>
                      <td className="p-2">{p.qty}</td>
                      <td className="p-2">{p.avg_effective_px.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Filtros tabla */}
        <section className="rounded-xl border border-white/10 p-3 bg-white/[0.02] flex flex-wrap items-center gap-3">
          <input placeholder="Buscar símbolo…" value={qSymbol} onChange={(e)=>setQSymbol(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm" />
          <div className="flex items-center gap-2">
            <span className="text-sm opacity-80">Side</span>
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {(["ALL","BUY","SELL"] as const).map(s => (
                <button key={s} onClick={() => setSideFilter(s)}
                  className={cls("px-2 py-1 text-xs border-r border-white/10 last:border-r-0", sideFilter===s ? "bg-white/15" : "bg-white/5 hover:bg-white/10")}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm opacity-80">Orden</span>
            <select value={sort} onChange={(e)=>setSort(e.target.value as SortKey)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm">
              <option value="ts_desc">Recientes</option>
              <option value="ts_asc">Antiguos</option>
              <option value="symbol">Símbolo</option>
              <option value="side">Side</option>
            </select>
          </div>
          <div className="ml-auto text-xs opacity-70">Mostrando {filtered.length} de {rows?.length ?? 0}</div>
        </section>

        {/* Tabla de operaciones */}
        <section className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left">
                <th className="p-2">ts</th><th className="p-2">symbol</th><th className="p-2">side</th><th className="p-2">qty</th>
                <th className="p-2">price</th><th className="p-2">effective</th><th className="p-2">impact (bps)</th><th className="p-2">fees/slip (bps)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? filtered.map(r => {
                const impactBps = ((r.effective_price - r.price) / r.price) * 10_000
                return (
                  <tr key={r.trade_id} className="border-t border-white/10">
                    <td className="p-2">{new Date(r.ts).toLocaleString()}</td>
                    <td className="p-2">{r.symbol}</td>
                    <td className={cls("p-2 font-semibold", r.side === "BUY" ? "text-emerald-300" : "text-rose-300")}>{r.side}</td>
                    <td className="p-2">{r.qty}</td>
                    <td className="p-2">{r.price.toFixed(4)}</td>
                    <td className="p-2">{r.effective_price.toFixed(4)}</td>
                    <td className={cls("p-2", impactBps >= 0 ? "text-rose-300" : "text-emerald-300")}>{impactBps.toFixed(1)}</td>
                    <td className="p-2">{r.fees_bp}/{r.slippage_bp}</td>
                  </tr>
                )
              }) : (
                <tr><td colSpan={8} className="p-4 text-sm opacity-70">No hay operaciones que cumplan los filtros.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Empty state */}
        {!hasTrades && (
          <div className="rounded-xl border border-white/10 p-5 bg-white/[0.03] text-center">
            <div className="text-sm opacity-80 mb-2">Aún no tienes operaciones para <b>{user}</b>.</div>
            <button onClick={()=>setShowNew(true)} className="px-4 py-2 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white shadow">Crear el primer trade</button>
          </div>
        )}

        {/* Modal nuevo trade */}
        {showNew && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
               onClick={() => !posting && setShowNew(false)}>
            <form onSubmit={submitNewTrade} className="w-full max-w-md rounded-2xl border border-white/10 bg-black/80 backdrop-blur p-5 space-y-3"
                  onClick={(e)=>e.stopPropagation()}>
              <div className="text-lg font-semibold">Nuevo trade</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs opacity-70">Usuario</label>
                  <input value={user} onChange={(e)=>setUser(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm" required />
                </div>
                <div className="col-span-2">
                  <label className="text-xs opacity-70">Símbolo</label>
                  <input value={ntSymbol} onChange={(e)=>setNtSymbol(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm" placeholder="BTC-USD, AAPL…" required />
                </div>
                <div>
                  <label className="text-xs opacity-70">Side</label>
                  <div className="flex rounded-lg border border-white/10 overflow-hidden">
                    {(["BUY","SELL"] as Side[]).map(s => (
                      <button type="button" key={s} onClick={()=>setNtSide(s)}
                        className={cls("flex-1 px-2 py-1 text-sm border-r border-white/10 last:border-r-0", ntSide===s ? "bg-white/15" : "bg-white/5 hover:bg-white/10")}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs opacity-70">Cantidad</label>
                  <input type="number" step="any" value={ntQty} onChange={(e)=>setNtQty(Number(e.target.value))}
                         className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm" required />
                </div>
                <div>
                  <label className="text-xs opacity-70">Precio</label>
                  <input type="number" step="any" value={ntPrice} onChange={(e)=>setNtPrice(Number(e.target.value))}
                         className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm" required />
                </div>
                <div>
                  <label className="text-xs opacity-70">Fees (bps)</label>
                  <input type="number" step="any" value={ntFees} onChange={(e)=>setNtFees(Number(e.target.value))}
                         className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs opacity-70">Slippage (bps)</label>
                  <input type="number" step="any" value={ntSlip} onChange={(e)=>setNtSlip(Number(e.target.value))}
                         className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm" />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" disabled={posting} onClick={()=>setShowNew(false)}
                        className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-sm">Cancelar</button>
                <button disabled={posting} className="px-3 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm">
                  {posting ? "Creando…" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        )}

        <p className="text-xs opacity-60">Nota: “impact (bps)” ≈ (effective − price)/price * 10,000. Resume el efecto conjunto de fees y slippage.</p>
      </div>
    </main>
  )
}
