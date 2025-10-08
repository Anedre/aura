// src/app/asset/[symbol]/page.tsx
"use client";

import { notFound } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
const MarketChartE = dynamic(() => import('@/components/MarketChartE'), { ssr: false });
/* ================= Tipos para posiciones (modo demo) ================= */

type PositionSide = "LONG" | "SHORT";
type Position = {
  id: string;
  symbol: string;
  side: PositionSide;
  qty: number;       // unidades del activo
  leverage?: number; // opcional
  entry: number;     // precio de entrada
  openedAt: number;
};

/* ================= Persistencia local ================= */

const LS_KEY = "aura_positions_v1";

function loadAllPositions(): Position[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Position[]) : [];
  } catch {
    return [];
  }
}

function loadPositions(symbol: string): Position[] {
  return loadAllPositions().filter((p) => p.symbol === symbol);
}

function savePositions(all: Position[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

/* ================= Utilidades negocio (PnL) ================= */

function computePnL(pos: Position, mark: number) {
  const sideSign = pos.side === "LONG" ? 1 : -1;
  const diff = (mark - pos.entry) * sideSign; // por unidad
  const pnl = diff * pos.qty;                  // monetario
  const notional = pos.entry * pos.qty;
  const margin = pos.leverage && pos.leverage > 0 ? notional / pos.leverage : notional;
  const roiPct = margin > 0 ? (pnl / margin) * 100 : 0;
  return { pnl, roiPct, margin };
}

function uuid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/* ================= Panel de trading (demo) ================= */

function TradePanel({
  symbol,
  lastPrice,
  onPositionsChange,
}: {
  symbol: string;
  lastPrice: number | null;
  onPositionsChange?: (pos: Position[]) => void;
}) {
  const [side, setSide] = useState<PositionSide>("LONG");
  const [qty, setQty] = useState<number>(1);
  const [lev, setLev] = useState<number>(1);

  const [list, setList] = useState<Position[]>([]);
  useEffect(() => { setList(loadPositions(symbol)); }, [symbol]);

  function openPosition() {
    if (lastPrice == null || qty <= 0) return;
    const pos: Position = {
      id: uuid(),
      symbol,
      side,
      qty,
      leverage: lev > 1 ? lev : undefined,
      entry: lastPrice,
      openedAt: Date.now(),
    };
    const all = [...loadAllPositions(), pos];
    savePositions(all);
    const my = all.filter((p) => p.symbol === symbol);
    setList(my);
    onPositionsChange?.(my);
  }

  function close(id: string) {
    const all = loadAllPositions().filter((p) => p.id !== id);
    savePositions(all);
    const my = all.filter((p) => p.symbol === symbol);
    setList(my);
    onPositionsChange?.(my);
  }

  

  const mark = lastPrice ?? 0;

  return (
    <div className="card p-4 space-y-4">
      <div className="text-sm opacity-80">Ticket</div>

      <div className="flex gap-2">
        <button className={`btn ${side === "LONG" ? "btn-primary" : ""}`} onClick={() => setSide("LONG")}>Long</button>
        <button className={`btn ${side === "SHORT" ? "btn-danger" : ""}`} onClick={() => setSide("SHORT")}>Short</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Cantidad
          <input type="number" className="w-full mt-1 input" min={0} step="0.0001"
                 value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </label>
        <label className="text-sm">
          Apalancamiento
          <input type="number" className="w-full mt-1 input" min={1} step="1"
                 value={lev} onChange={(e) => setLev(Math.max(1, Number(e.target.value)))} />
        </label>
      </div>

      <button className="btn btn-primary w-full" onClick={openPosition} disabled={lastPrice == null || qty <= 0}>
        Abrir posición {lastPrice != null ? `@ ${lastPrice.toFixed(4)}` : ""}
      </button>

      <div className="pt-2 border-t border-white/10">
        <div className="text-sm opacity-80 mb-2">Posiciones abiertas</div>
        {list.length === 0 && <div className="text-xs opacity-60">Sin posiciones.</div>}

        {list.length > 0 && (
          <div className="space-y-2">
            {list.map((p) => {
              const { pnl, roiPct, margin } = computePnL(p, mark);
              return (
                <div key={p.id} className="rounded-lg border border-white/10 p-2 flex items-center justify-between">
                  <div className="text-sm">
                    <div className="font-medium">
                      {p.side} {p.qty} @ {p.entry.toFixed(4)} {p.leverage ? `· x${p.leverage}` : ""}
                    </div>
                    <div className="text-xs opacity-70">Margin: {margin.toFixed(2)}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm ${pnl >= 0 ? "text-[--success]" : "text-[--danger]"}`}>
                      {pnl >= 0 ? "▲" : "▼"} {pnl.toFixed(2)}
                    </div>
                    <div className="text-xs opacity-70">{roiPct.toFixed(2)}%</div>
                  </div>
                  <button className="text-xs px-2 py-1 rounded hover:bg-white/10 ml-2" onClick={() => close(p.id)}>
                    Cerrar
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-white/10">
        <div className="text-sm opacity-80 mb-2">Simulador</div>
        <SimPanel symbol={symbol} positions={list} mark={mark} />
      </div>
    </div>
  );
}

/* ================= Simulador simple ================= */

function SimPanel({ symbol, positions, mark }: { symbol: string; positions: Position[]; mark: number }) {
  const [exit, setExit] = useState<number>(mark);
  useEffect(() => { setExit(mark); }, [mark]);

  const agg = useMemo(() => {
    let pnl = 0; let margin = 0;
    for (const p of positions) {
      const { pnl: u, margin: m } = computePnL(p, exit);
      pnl += u; margin += m;
    }
    const roi = margin > 0 ? (pnl / margin) * 100 : 0;
    return { pnl, roi };
  }, [positions, exit]);



  return (
    <div className="space-y-2">
      <label className="text-sm">
        Precio de salida
        <input
          type="number"
          className="w-full mt-1 input"
          step="0.0001"
          value={Number.isFinite(exit) ? exit : 0}
          onChange={(e) => setExit(Number(e.target.value))}
        />
      </label>
      <div className="text-sm">
        PnL total ({symbol}):{" "}
        <span className={agg.pnl >= 0 ? "text-[--success]" : "text-[--danger]"}>
          {agg.pnl >= 0 ? "▲" : "▼"} {agg.pnl.toFixed(2)}
        </span>{" "}
        <span className="opacity-70">({agg.roi.toFixed(2)}%)</span>
      </div>
    </div>
  );
}

/* ================= Página ================= */

export default function AssetPage({ params }: { params: { symbol?: string } }) {
  const symbol = (params.symbol || "").toUpperCase();
  if (!symbol) notFound();

  const [last, setLast] = useState<number | null>(null);

    const [rangeDelta, setRangeDelta] = useState<number | null>(null);
  const [rangeLabel, setRangeLabel] = useState<'1D'|'1W'|'1M'|'1Y'|'ALL'>('ALL');

  return (
    <main className="min-h-dvh bg-background text-foreground">
      {/* más ancho total que 6xl */}
      <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{symbol}</h1>
            {rangeDelta != null && (
              <span
                className={`px-2 py-1 rounded text-xs ${
                  rangeDelta >= 0 ? 'text-emerald-300 bg-emerald-500/10' : 'text-rose-300 bg-rose-500/10'
                }`}
                title="Variación acumulada en el rango visible"
              >
                {rangeDelta >= 0 ? '▲' : '▼'} {Math.abs(rangeDelta).toFixed(2)}% ({rangeLabel})
              </span>
            )}
          </div>
          <div className="text-sm opacity-80">
            {last != null ? <>Último: <span className="font-semibold">{last.toFixed(4)}</span></> : "Cargando…"}
          </div>
        </header>


        {/* grid de 2 columnas: chart flexible + panel de ancho fijo */}
        <section className="gap-6 grid
                            lg:grid-cols-[minmax(0,1fr)_340px]
                            xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-h-[380px] xl:min-h-[520px]">
            <MarketChartE
              symbol={symbol}
              provider="yahoo"
              tf="5m"
              emaDurationsMin={[20, 60]}
              height={440}
              onPrice={setLast}
              baseline={null}
              showLastPrice
              showGaps
              useLiveMarketRange="max"  
              onRangeDelta={(d, r) => { setRangeDelta(d); setRangeLabel(r); }}  
            />
          </div>

          <div>
            <TradePanel symbol={symbol} lastPrice={last} />
          </div>
        </section>
      </div>
    </main>
  );
}
