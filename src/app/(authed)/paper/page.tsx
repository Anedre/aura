// src/app/(authed)/paper/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import MarketChartE from "@/components/MarketChartE";
import PriceTicker from "@/components/PriceTicker";
import { logout } from "@/lib/auth";
import { useLivePrice } from "@/hooks/useLivePrice";
import SymbolAvatar from "@/components/SymbolAvatar";
import AssetHover from "@/components/AssetHover";

// Mini gráfico PnL
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { BarSeriesOption, LineSeriesOption } from "echarts/charts";
import type { GridComponentOption, TooltipComponentOption } from "echarts/components";
import type { ComposeOption } from "echarts/core";
echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

const ThemeToggle = dynamic(() => import("@/app/components/theme/ThemeToggle"), { ssr: false });

type Side = "LONG" | "SHORT";
type DemoTrade = { id: string; symbol: string; side: Side; qty: number; entry: number; openedAt: number; exit?: number; closedAt?: number };
type DemoSession = { createdAt: number; baseCash: number };

const START_CASH = 100;
const LS_SESSION = "paper_session_v1";
const LS_TRADES = "paper_trades_v1";

// Lista de símbolos para búsqueda (demo)
const SEARCH_LIST = [
  "BTC-USD","ETH-USD","SPY","TLT","GLD","QQQ","AAPL","MSFT","TSLA","AMZN","NVDA","META","GOOG",
  "EURUSD=X","USDJPY=X","GBPUSD=X","USDCAD=X","DOGE-USD","SOL-USD","ADA-USD"
] as const;

function fmtTime(t: number) { const d = new Date(t); return d.toLocaleString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function uuid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }

function loadSession(): DemoSession {
  try { const raw = localStorage.getItem(LS_SESSION); if (raw) return JSON.parse(raw) as DemoSession; } catch {}
  const fresh: DemoSession = { createdAt: Date.now(), baseCash: START_CASH };
  localStorage.setItem(LS_SESSION, JSON.stringify(fresh));
  return fresh;
}
function saveSession(s: DemoSession) { localStorage.setItem(LS_SESSION, JSON.stringify(s)); }

function loadTrades(symbol?: string): DemoTrade[] {
  try {
    const raw = localStorage.getItem(LS_TRADES);
    const all = raw ? (JSON.parse(raw) as DemoTrade[]) : [];
    return symbol ? all.filter((t) => t.symbol === symbol) : all;
  } catch { return []; }
}
function saveTrades(all: DemoTrade[]) { localStorage.setItem(LS_TRADES, JSON.stringify(all)); }

function sideSign(side: Side) { return side === "LONG" ? 1 : -1; }
function unrealized(trade: DemoTrade, mark: number) { return (mark - trade.entry) * sideSign(trade.side) * trade.qty; }
function realized(trade: DemoTrade) { return trade.exit == null ? 0 : (trade.exit - trade.entry) * sideSign(trade.side) * trade.qty; }

// Pequeño gráfico de PnL realizado (barras + línea acumulada)
type PnlOption = ComposeOption<BarSeriesOption | LineSeriesOption | GridComponentOption | TooltipComponentOption>;
function PnlChart({ trades }: { trades: DemoTrade[] }) {
  const closed = useMemo(() => trades.filter(t => t.exit != null && t.closedAt != null).sort((a,b) => (a.closedAt! - b.closedAt!)), [trades]);
  if (closed.length === 0) return <div className="text-xs opacity-60">Aún no cierras operaciones.</div>;

  const x = closed.map(t => new Date(t.closedAt!).toLocaleTimeString([], { hour12:false, hour:"2-digit", minute:"2-digit" }));
  const bars = closed.map(t => realized(t));
  const cum = (() => { let s=0; return bars.map(v => (s+=v)); })();

  const option: PnlOption = {
    backgroundColor: "transparent",
    grid: { left: 28, right: 8, top: 8, bottom: 22, containLabel: false },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "category", data: x, axisLine: { lineStyle: { color: "rgba(255,255,255,0.18)" } }, axisLabel: { color: "rgba(255,255,255,0.7)" }, axisTick: { show:false } },
    yAxis: { type: "value", axisLabel: { color: "rgba(255,255,255,0.7)" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } } },
    series: [
      { name: "PnL", type: "bar", data: bars.map(v => ({ value: v, itemStyle: { color: v >= 0 ? "#22C55E" : "#EF4444" } })), barWidth: 10 },
      { name: "Acumulado", type: "line", data: cum, smooth: true, showSymbol: false, lineStyle: { color: "#60A5FA", width: 2 } }
    ]
  };
  return <ReactECharts option={option} style={{ height: 160 }} />;
}

function DemoTicket({ symbol, mark, onChange }: { symbol: string; mark: number | null; onChange?: (list: DemoTrade[], session: DemoSession) => void }) {
  const [side, setSide] = useState<Side>("LONG");
  const [amount, setAmount] = useState<number>(10);
  const [session, setSession] = useState<DemoSession>(() => loadSession());
  const [trades, setTrades] = useState<DemoTrade[]>(() => loadTrades(symbol));
  useEffect(() => { setTrades(loadTrades(symbol)); }, [symbol]);

  function openTrade() {
    if (mark == null || amount <= 0) return;
    const qty = amount / mark;
    const t: DemoTrade = { id: uuid(), symbol, side, qty, entry: mark, openedAt: Date.now() };
    const all = [...loadTrades(), t]; saveTrades(all);
    const my = all.filter(x => x.symbol === symbol); setTrades(my); onChange?.(my, session);
  }
  function closeTrade(id: string) {
    const all = loadTrades(); const idx = all.findIndex(t => t.id === id); if (idx === -1 || mark == null) return;
    all[idx] = { ...all[idx], exit: mark, closedAt: Date.now() }; saveTrades(all);
    const my = all.filter(x => x.symbol === symbol); setTrades(my);
    const realizedSum = loadTrades().reduce((acc, tr) => acc + realized(tr), 0);
    const ses: DemoSession = { ...session, baseCash: START_CASH + realizedSum }; setSession(ses); saveSession(ses); onChange?.(my, ses);
  }

  const realizedSum = useMemo(() => trades.filter(t => t.exit != null).reduce((a,t)=> a + realized(t), 0), [trades]);
  const unreal = useMemo(() => (mark == null ? 0 : trades.filter(t => t.exit == null).reduce((a,t)=> a + unrealized(t, mark), 0)), [trades, mark]);
  const cash = session.baseCash; const equity = cash + unreal; const baseAsset = symbol.split("-")[0] || symbol;
  const closed = trades.filter(t => t.exit != null);

  return (
    <aside className="card p-4 space-y-4" aria-label="Panel de simulador">
      <div className="grid grid-cols-2 gap-3">
        <div className="tooltip">
          <div className="text-xs opacity-70">Saldo base</div>
          <div className="text-2xl font-semibold">${START_CASH.toFixed(2)}</div>
          <div role="tooltip" className="tooltip-panel"><div className="tooltip-title">Saldo base</div><div className="tooltip-text">Fondos virtuales iniciales para practicar.</div></div>
        </div>
        <div className="text-right tooltip">
          <div className="text-xs opacity-70">Equity actual</div>
          <div className="text-2xl font-semibold">{equity >= 0 ? "↑" : "↓"} ${equity.toFixed(2)}</div>
          <div role="tooltip" className="tooltip-panel"><div className="tooltip-title">Equity</div><div className="tooltip-text">Saldo base + PnL no realizado (cambia con el precio).</div></div>
        </div>
      </div>

      <div className="pt-2 border-t border-white/10 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="tooltip"><span className={`chip ${realizedSum >= 0 ? 'chip--green' : 'chip--red'}`}>Realizado: {realizedSum >= 0 ? '↑' : '↓'} ${realizedSum.toFixed(2)}</span><div role="tooltip" className="tooltip-panel"><div className="tooltip-title">PnL realizado</div><div className="tooltip-text">(salida − entrada) × signo (Long +1 / Short −1) × cantidad.</div></div></div>
          <div className="tooltip"><span className={`chip ${unreal >= 0 ? 'chip--green' : 'chip--red'}`}>No realizado: {unreal >= 0 ? '↑' : '↓'} ${unreal.toFixed(2)}</span><div role="tooltip" className="tooltip-panel"><div className="tooltip-title">PnL no realizado</div><div className="tooltip-text">(precio actual − entrada) × signo × cantidad.</div></div></div>
          <div className="tooltip"><span className={`chip ${(realizedSum + unreal) >= 0 ? 'chip--green' : 'chip--red'}`}>PnL total: {(realizedSum + unreal) >= 0 ? '↑' : '↓'} {(realizedSum + unreal).toFixed(2)}</span><div role="tooltip" className="tooltip-panel"><div className="tooltip-title">PnL total</div><div className="tooltip-text">Realizado + no realizado (tu variación acumulada).</div></div></div>
        </div>

        <div className="flex gap-2">
          <div className="tooltip"><button className={`btn ${side === "LONG" ? "btn-primary" : ""}`} onClick={() => setSide("LONG")}>Long</button><div role="tooltip" className="tooltip-panel"><div className="tooltip-title">Long</div><div className="tooltip-text">Compras; ganas si el precio sube.</div></div></div>
          <div className="tooltip"><button className={`btn ${side === "SHORT" ? "btn-danger" : ""}`} onClick={() => setSide("SHORT")}>Short</button><div role="tooltip" className="tooltip-panel tooltip-panel--danger"><div className="tooltip-title">Short</div><div className="tooltip-text">Vendes en corto; ganas si el precio baja.</div></div></div>
        </div>

        <label className="text-sm block tooltip">
          Monto (USD)
          <input type="range" min={1} max={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full" />
          <div className="text-xs opacity-70 mt-1">${amount.toFixed(2)} · equiv. {baseAsset}: {mark != null ? (amount / mark).toFixed(6) : "-"}</div>
          <div role="tooltip" className="tooltip-panel"><div className="tooltip-title">Monto</div><div className="tooltip-text">Cuánto invertirás en USD (calculamos la cantidad en {baseAsset}).</div></div>
        </label>

        <div className="tooltip w-full">
          <button className="btn btn-primary w-full" onClick={openTrade} disabled={mark == null || amount <= 0}>Abrir {side === "LONG" ? "Long" : "Short"} {mark != null ? `@ ${mark.toFixed(4)}` : ""}</button>
          <div role="tooltip" className="tooltip-panel"><div className="tooltip-title">Simular orden</div><div className="tooltip-text">Crea una operación al precio actual (sin comisiones).</div></div>
        </div>

        <div className="pt-2 border-t border-white/10">
          <div className="text-sm opacity-80 mb-2 tooltip">PnL realizado<div role="tooltip" className="tooltip-panel"><div className="tooltip-title">Gráfico de PnL</div><div className="tooltip-text">Barras: PnL por trade cerrado. Línea: PnL realizado acumulado.</div></div></div>
          <PnlChart trades={closed} />
        </div>
      </div>

      <div className="pt-2 border-t border-white/10">
        <div className="text-sm opacity-80 mb-2 tooltip">Operaciones abiertas<div role="tooltip" className="tooltip-panel"><div className="tooltip-title">Operaciones abiertas</div><div className="tooltip-text">Posiciones activas que aún no has cerrado.</div></div></div>
        {trades.filter(t => t.exit == null).length === 0 && (<div className="text-xs opacity-60">Sin operaciones abiertas.</div>)}
        <div className="space-y-2">
          {trades.filter(t => t.exit == null).map(t => {
            const pnlNow = mark != null ? unrealized(t, mark) : 0;
            return (
              <div key={t.id} className="rounded-lg border border-white/10 p-2 flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-medium">{t.side} {t.qty.toFixed(6)} @ {t.entry.toFixed(4)}</div>
                  <div className="text-xs opacity-70">{fmtTime(t.openedAt)}</div>
                </div>
                <div className="tooltip">
                  <div className={`text-sm ${pnlNow >= 0 ? "text-[--success]" : "text-[--danger]"}`}>{pnlNow >= 0 ? "↑" : "↓"} {pnlNow.toFixed(2)}</div>
                  <div role="tooltip" className="tooltip-panel"><div className="tooltip-title">PnL no realizado</div><div className="tooltip-text">({mark != null ? mark.toFixed(4) : '-'} − {t.entry.toFixed(4)}) × {t.side === 'LONG' ? '+1' : '-1'} × {t.qty.toFixed(6)}</div></div>
                </div>
                <button className="text-xs px-2 py-1 rounded hover:bg-white/10 ml-2" onClick={() => closeTrade(t.id)}>Cerrar</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-2 border-t border-white/10">
        <div className="text-sm opacity-80 mb-2 tooltip">Historial<div role="tooltip" className="tooltip-panel"><div className="tooltip-title">Historial</div><div className="tooltip-text">Operaciones cerradas y su PnL realizado.</div></div></div>
        {closed.length === 0 ? (
          <div className="text-xs opacity-60">Aún no cierras operaciones.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="opacity-70"><tr><th className="text-left py-1">Lado</th><th className="text-left py-1">Qty</th><th className="text-left py-1">Entrada</th><th className="text-left py-1">Salida</th><th className="text-left py-1">PnL</th></tr></thead>
              <tbody>
                {closed.map(t => { const r = realized(t); return (
                  <tr key={t.id} className="border-t border-white/10">
                    <td className="py-1">{t.side}</td>
                    <td className="py-1">{t.qty.toFixed(6)}</td>
                    <td className="py-1">{t.entry.toFixed(4)}</td>
                    <td className="py-1">{t.exit!.toFixed(4)}</td>
                    <td className="py-1">
                      <div className="tooltip inline-block">
                        <span className={`${r >= 0 ? "text-[--success]" : "text-[--danger]"}`}>{r >= 0 ? "↑" : "↓"} {r.toFixed(2)}</span>
                        <div role="tooltip" className="tooltip-panel"><div className="tooltip-title">PnL realizado</div><div className="tooltip-text">({t.exit!.toFixed(4)} − {t.entry.toFixed(4)}) × {t.side === 'LONG' ? '+1' : '-1'} × {t.qty.toFixed(6)}</div></div>
                      </div>
                    </td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </aside>
  );
}

export default function PaperPage() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = (params.get("symbol") || "BTC-USD").toUpperCase();

  const [symbol, setSymbol] = useState<string>(initial);
  const [mark, setMark] = useState<number | null>(null);
  const [rangeDelta, setRangeDelta] = useState<number | null>(null);

  const [trades, setTrades] = useState(() => [] as ReturnType<typeof loadTrades>);
  useEffect(() => { setTrades(loadTrades(symbol)); }, [symbol]);

  const open = useMemo(() => trades.filter(t => t.symbol === symbol && t.exit == null), [trades, symbol]);
  const netQty = useMemo(() => open.reduce((a,t)=> a + (t.side === "LONG" ? t.qty : -t.qty), 0), [open]);
  const netNotional = useMemo(() => open.reduce((a,t)=> a + (t.side === "LONG" ? t.qty*t.entry : -t.qty*t.entry), 0), [open]);
  const breakeven = netQty !== 0 ? netNotional / netQty : null;

  const [query, setQuery] = useState<string>(symbol);
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return (SEARCH_LIST as readonly string[]).slice(0, 8);
    return (SEARCH_LIST as readonly string[]).filter((s) => s.includes(q)).slice(0, 10);
  }, [query]);

  async function handleLogout() { await logout(); router.replace("/"); }

  const { price: livePrice } = useLivePrice(symbol);
  useEffect(() => { if (livePrice != null) setMark(livePrice); }, [livePrice]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowSearch(false);
      if (e.key === '/' && !showSearch) { e.preventDefault(); setShowSearch(true); setQuery(symbol); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSearch, symbol]);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Header principal */}
        <header className="flex flex-wrap items-start gap-4 justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Modo Demo (Paper Trading)</h1>
            <p className="text-sm opacity-75 max-w-prose">Precios reales, operaciones simuladas. Practica con ${START_CASH} USD virtuales.</p>
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button className="btn" onClick={handleLogout}>Salir</button>
          </div>
        </header>

        {/* Acciones rápidas + precio actual */}
        <section className="card p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 justify-between">
            <div className="tooltip">
              <button className="btn btn-primary" onClick={() => { setQuery(symbol); setShowSearch(true); }}>
                Buscar símbolo (tecla /)
              </button>
              <div role="tooltip" className="tooltip-panel"><div className="tooltip-title">Buscar</div><div className="tooltip-text">Abre el buscador centrado para elegir un activo.</div></div>
            </div>
            <PriceTicker symbol={symbol} price={mark} deltaPct={rangeDelta ?? null} className="sm:ml-2 chip" updateEveryMs={2500} percentDecimals={2} />
          </div>
        </section>

        {/* Contenido principal: 2 columnas */}
        <section className="grid lg:grid-cols-3 gap-4 sm:gap-5">
          <div className="lg:col-span-2 space-y-3">
            <div className="card p-2 sm:p-3">
              <MarketChartE
                symbol={symbol}
                tf="5m"
                height={460}
                onPrice={setMark}
                baseline={breakeven ?? null}
                showLastPrice
                onRangeDelta={(d: number) => { setRangeDelta(d); }}
              />
            </div>
          </div>
          <div>
            <DemoTicket symbol={symbol} mark={mark} />
          </div>
        </section>

        {/* Bloque inferior: Cómo funciona */}
        <section className="grid md:grid-cols-2 gap-4">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="chip chip--green">↑ Long</span>
              <span className="text-sm opacity-70">Gana si el precio sube</span>
            </div>
            <p className="text-sm opacity-80">Compra el activo esperando que suba. Si el precio aumenta respecto a tu entrada, tu resultado es positivo.</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="chip chip--red">↓ Short</span>
              <span className="text-sm opacity-70">Gana si el precio baja</span>
            </div>
            <p className="text-sm opacity-80">Vendes en corto esperando que baje. Si el precio cae respecto a tu entrada, tu resultado es positivo.</p>
          </div>
        </section>
      </div>

      {/* Overlay de búsqueda centrado */}
      {showSearch && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSearch(false)} />
          <div className="absolute inset-0 flex items-start sm:items-center justify-center p-4 sm:p-6">
            <div className="card w-full max-w-xl p-4">
              <div className="text-sm opacity-75 mb-2">Buscar símbolo</div>
              <input
                autoFocus
                className="input w-full"
                placeholder="Escribe un símbolo (ej. BTC-USD, AAPL, EURUSD=X)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const pick = matches[0];
                    if (pick) { setSymbol(pick); setQuery(pick); setShowSearch(false); }
                  } else if (e.key === 'Escape') {
                    setShowSearch(false);
                  }
                }}
              />
              <div className="mt-2 max-h-72 overflow-auto">
                {matches.length === 0 ? (
                  <div className="text-sm opacity-60 px-1 py-2">Sin coincidencias</div>
                ) : (
                  matches.map((s) => (
                    <button
                      key={s}
                      className={`w-full text-left px-3 py-2 rounded hover:bg-white/10 ${s===symbol? 'bg-white/5':''}`}
                      onClick={() => { setSymbol(s); setQuery(s); setShowSearch(false); }}
                    >
                      <span className="inline-flex items-center gap-2">
                        <SymbolAvatar symbol={s} size={18} />
                        <AssetHover symbol={s}><span>{s}</span></AssetHover>
                      </span>
                    </button>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between mt-3 text-xs opacity-60">
                <span>Enter: seleccionar</span>
                <span>Esc: cerrar</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}





