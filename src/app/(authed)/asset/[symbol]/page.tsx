// src/app/asset/[symbol]/page.tsx
"use client";

import { notFound } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
type RangeBtn = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "MAX";
// Use the component's own exported Props to keep types aligned
const MarketChartE = dynamic<import("@/components/MarketChartE").Props>(
  () => import("@/components/MarketChartE").then((m) => m.default),
  { ssr: false }
);
import PriceTicker from "@/components/PriceTicker";
import SymbolAvatar from "@/components/SymbolAvatar";
import AssetHover from "@/components/AssetHover";
import { getAssetMeta } from "@/lib/assets.meta";
import { classifySymbol, type AssetClass, getSessionInfo } from "@/lib/market";
import { GlossaryText } from "@/components/glossary/Glossary";
import RealtimePrice from "@/components/RealtimePrice";
// import WsDebugStatus from "@/components/WsDebugStatus";
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
  const [rangeLabel, setRangeLabel] = useState<RangeBtn>('MAX');
  const meta = useMemo(() => getAssetMeta(symbol), [symbol]);
  const klass = useMemo<AssetClass | 'other'>(() => classifySymbol(symbol) as AssetClass | 'other', [symbol]);
  const session = useMemo(() => getSessionInfo(symbol), [symbol]);
  const longCopy = useMemo(() => {
    const name = meta?.name ?? symbol;
    const intro = meta?.description ?? `Activo de tipo ${klass}.`;
    const extra = klass === 'crypto'
      ? `Opera 24/7 y suele presentar mayor volatilidad que otros mercados. Si recién empiezas, usa un horizonte claro y evita el apalancamiento hasta sentirte cómodo con el riesgo.`
      : klass === 'forex'
        ? `Es un mercado 24/5 con alta liquidez. Los pares se mueven por diferenciales de tasas e información macro. Define tu horizonte y observa eventos que puedan aumentar la volatilidad.`
        : klass === 'etf'
          ? `Un ETF replica un índice o cesta; permite diversificación con una sola compra. Útil para reducir riesgo idiosincrático y aprender dinámica de mercado con menor complejidad.`
          : klass === 'equity'
            ? `Acción individual: su precio puede ser sensible a resultados, guías y noticias. Revisa liquidez y volatilidad antes de operar y ajusta el tamaño de posición al riesgo.`
            : `Activo de mercado. Revisa liquidez y horizonte antes de tomar decisiones.`;
    const sess = session?.note ? `Sesión: ${session.note}` : '';
    return `${name}. ${intro} ${extra} ${sess}`;
  }, [meta?.name, meta?.description, klass, session?.note, symbol]);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      {/* más ancho total que 6xl */}
      <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <SymbolAvatar symbol={symbol} size={26} />
              <AssetHover symbol={symbol}><span>{symbol}</span></AssetHover>
            </h1>
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

        {/* Descripción completa del activo (texto educativo, sin hover) */}
        <section className="card p-4">
          <div className="text-sm opacity-80 mb-1">Descripción</div>
          <div className="text-sm leading-relaxed">
            <GlossaryText text={longCopy} />
          </div>
        </section>

        <div className="mb-4 space-y-3">
          <RealtimePrice assetId={symbol} className="flex flex-wrap items-center gap-2 text-sm px-3 py-2 rounded bg-white/5 border border-white/10" />
          <PriceTicker symbol={symbol} price={last} deltaPct={rangeDelta ?? null} />
        </div>

        {/* WS Debug deshabilitado para modo 100% local */}


        {/* grid de 2 columnas: chart flexible + panel de ancho fijo */}
        <section className="gap-6 grid
                            lg:grid-cols-[minmax(0,1fr)_340px]
                            xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-h-[380px] xl:min-h-[520px]">
            <MarketChartE
              symbol={symbol}
              tf="5m"
              height={440}
              onPrice={setLast}
              baseline={null}
              showLastPrice
              onRangeDelta={(d: number, r: RangeBtn) => { setRangeDelta(d); setRangeLabel(r); }}  
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

