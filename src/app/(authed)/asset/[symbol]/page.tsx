// src/app/asset/[symbol]/page.tsx
"use client";

import { notFound, useParams } from "next/navigation";
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
import NewsList from "@/components/news/NewsList";
import { GlossaryText } from "@/components/glossary/Glossary";
import RealtimePrice from "@/components/RealtimePrice";
import { getAssetMeta } from "@/lib/assets.meta";
import { getFeed, type FeedItem } from "@/lib/api.feed";
import { fetchSymbolNews, type NewsItem } from "@/lib/api.news";
import { classifySymbol, type AssetClass, getSessionInfo } from "@/lib/market";
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

function actionLabel(action: FeedItem["action"]): string {
  if (action === "BUY") return "Compra sugerida";
  if (action === "SELL") return "Venta sugerida";
  if (action === "HOLD") return "En espera";
  return "Sin señal clara";
}

function formatHorizonLabel(value?: string | null): string {
  if (!value) return "Próximo cierre (1 día)";
  const lower = value.trim().toLowerCase();
  if (lower === "1d") return "Próximo cierre (1 día)";
  if (lower === "3d") return "Próximos 3 días";
  if (lower === "5d") return "Próximos 5 días";
  if (lower === "10d") return "Próximos 10 días";
  if (lower === "1w") return "Próximas semanas";
  if (lower === "1h") return "Próxima hora";
  const match = /^([0-9]+)([a-z]+)$/.exec(lower);
  if (match) {
    const amount = Number(match[1] ?? "0");
    const unit = match[2];
    if (Number.isFinite(amount) && amount > 0) {
      if (unit === "d") return amount === 1 ? "Próximo día" : `Próximos ${amount} días`;
      if (unit === "w") return amount === 1 ? "Próxima semana" : `Próximas ${amount} semanas`;
      if (unit === "h") return amount === 1 ? "Próxima hora" : `Próximas ${amount} horas`;
    }
  }
  return `Horizonte ${value}`;
}

function formatPercent(value: number | null | undefined, digits = 0): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const scaled = Math.abs(value) <= 1 ? value * 100 : value;
  return `${scaled.toFixed(digits)}%`;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

type RouteParams = { symbol?: string | string[] };
type RouteParamsPromise = Promise<RouteParams>;

function extractSymbol(value: RouteParams | undefined): string {
  if (!value) return "";
  const raw = value.symbol;
  const symbol = Array.isArray(raw) ? raw[0] : raw;
  return (symbol ?? "").toUpperCase();
}

export default function AssetPage({}: { params?: RouteParamsPromise }) {
  const params = useParams<RouteParams>();
  const symbol = extractSymbol(params);
  if (!symbol) notFound();

  const [last, setLast] = useState<number | null>(null);

  const [rangeDelta, setRangeDelta] = useState<number | null>(null);
  const [rangeLabel, setRangeLabel] = useState<RangeBtn>('MAX');
  const [predictions, setPredictions] = useState<FeedItem[] | null>(null);
  const [predictionLoading, setPredictionLoading] = useState<boolean>(false);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [symbolNews, setSymbolNews] = useState<NewsItem[] | null>(null);
  const [newsLoading, setNewsLoading] = useState<boolean>(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const meta = useMemo(() => getAssetMeta(symbol), [symbol]);
  const klass = useMemo<AssetClass | 'other'>(() => classifySymbol(symbol) as AssetClass | 'other', [symbol]);
  const session = useMemo(() => getSessionInfo(symbol), [symbol]);
  const longCopy = useMemo(() => {
    const name = meta?.name ?? symbol;
    const intro = meta?.description ?? `Activo de tipo ${klass}.`;
    const extra =
      klass === "crypto"
        ? "Opera 24/7 y suele presentar mayor volatilidad que otros mercados. Si recién empiezas, usa un horizonte claro y evita el apalancamiento hasta sentirte cómodo con el riesgo."
        : klass === "forex"
          ? "Es un mercado 24/5 con alta liquidez. Los pares se mueven por diferenciales de tasas e información macro. Define tu horizonte y observa eventos que puedan aumentar la volatilidad."
          : klass === "etf"
            ? "Un ETF replica un índice o cesta; permite diversificación con una sola compra. Es útil para reducir riesgo idiosincrático y aprender la dinámica del mercado con menor complejidad."
            : klass === "equity"
              ? "Acción individual: su precio puede ser sensible a resultados, guías y noticias. Revisa liquidez y volatilidad antes de operar y ajusta el tamaño de tu posición al riesgo."
              : "Activo de mercado. Revisa liquidez y horizonte antes de tomar decisiones.";
    const sess = session?.note ? `Sesión: ${session.note}` : "";
    return `${name}. ${intro} ${extra} ${sess}`;
  }, [meta?.name, meta?.description, klass, session?.note, symbol]);

  useEffect(() => {
    let active = true;
    async function loadPredictions() {
      try {
        setPredictionLoading(true);
        setPredictionError(null);
        const params = new URLSearchParams();
        params.set("symbols", symbol);
        params.set("limit", "24");
        const data = await getFeed(params);
        if (!active) return;
        setPredictions(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!active) return;
        setPredictions([]);
        setPredictionError(error instanceof Error ? error.message : String(error));
      } finally {
        if (active) setPredictionLoading(false);
      }
    }
    void loadPredictions();
    return () => {
      active = false;
    };
  }, [symbol]);

  useEffect(() => {
    const metaName = meta?.name;
    let active = true;
    async function loadNews() {
      if (!symbol) {
        setSymbolNews([]);
        return;
      }
      try {
        setNewsLoading(true);
        setNewsError(null);
        const items = await fetchSymbolNews(symbol, { limit: 8, name: metaName });
        if (!active) return;
        setSymbolNews(items);
      } catch (error) {
        if (!active) return;
        setSymbolNews([]);
        setNewsError(error instanceof Error ? error.message : String(error));
      } finally {
        if (active) setNewsLoading(false);
      }
    }
    void loadNews();
    return () => {
      active = false;
    };
  }, [symbol, meta?.name]);

  const horizonSummaries = useMemo(() => {
    if (!Array.isArray(predictions) || predictions.length === 0) return [];
    const byHz = new Map<string, FeedItem>();
    for (const item of predictions) {
      if (!item || typeof item !== "object") continue;
      const key = typeof item.horizon === "string" && item.horizon.length > 0 ? item.horizon.toLowerCase() : "1d";
      const current = byHz.get(key);
      if (!current || (item.p_conf ?? 0) > (current.p_conf ?? 0)) {
        byHz.set(key, item);
      }
    }
    return Array.from(byHz.entries())
      .map(([key, item]) => ({
        key,
        label: formatHorizonLabel(key),
        item,
        confidence: item.p_conf ?? null,
      }))
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  }, [predictions]);

  const bestPrediction = horizonSummaries.length > 0 ? horizonSummaries[0].item : null;

  const predictionNarratives = useMemo(
    () =>
      horizonSummaries.map(({ key, label, item }) => {
        const confidence =
          typeof item.p_conf === "number" ? `${Math.round(item.p_conf * 100)}%` : "un nivel moderado de certeza";
        const sigma = typeof item.sigma === "number" ? ` (σ ${formatPercent(item.sigma, 1)})` : "";
        const stops =
          item.stops && typeof item.stops.tp === "number" && typeof item.stops.sl === "number"
            ? ` Objetivo: ${formatNumber(item.stops.tp, 2)} · Protección: ${formatNumber(item.stops.sl, 2)}.`
            : "";
        return {
          key,
          text: `${actionLabel(item.action)} en ${label} con ${confidence}${sigma}.${stops}`,
        };
      }),
    [horizonSummaries],
  );

  const indicatorSummary = useMemo(() => {
    if (!bestPrediction) {
      return "El feed todavía no entrega una señal reciente para este símbolo. Vuelve a revisar en unos minutos.";
    }
    const horizonText = formatHorizonLabel(bestPrediction.horizon).toLowerCase();
    const confidence =
      typeof bestPrediction.p_conf === "number" ? `${Math.round(bestPrediction.p_conf * 100)}%` : "un nivel moderado";
    const actionText =
      bestPrediction.action === "BUY"
        ? "aprovechar un movimiento alcista"
        : bestPrediction.action === "SELL"
          ? "protegerte ante una posible caída"
          : bestPrediction.action === "HOLD"
            ? "esperar una confirmación adicional"
            : "mantenerte al margen hasta tener más información";
    const sigmaText =
      typeof bestPrediction.sigma === "number"
        ? ` El modelo estima una incertidumbre (σ) de ${formatPercent(bestPrediction.sigma, 1)}, útil para dimensionar riesgo.`
        : "";
    let stopsText = "";
    if (bestPrediction.stops && typeof bestPrediction.stops.tp === "number" && typeof bestPrediction.stops.sl === "number") {
      stopsText = ` Sugiere tomar utilidades cerca de ${formatNumber(bestPrediction.stops.tp, 2)} y proteger la posición si toca ${formatNumber(bestPrediction.stops.sl, 2)}.`;
    }
    const marginText =
      typeof bestPrediction.margin === "number"
        ? ` El margen esperado del escenario central es ${formatPercent(bestPrediction.margin, 1)}.`
        : "";
    return `Para ${horizonText} el modelo propone ${actionText} con ${confidence} de certeza.${sigmaText}${stopsText}${marginText}`;
  }, [bestPrediction]);

  const indicatorMetrics = useMemo(() => {
    if (!bestPrediction) return [];
    const rows: Array<{ label: string; value: string; helper: string }> = [];
    if (bestPrediction.p_conf != null) {
      rows.push({
        label: "Certeza (p)",
        value: formatPercent(bestPrediction.p_conf, 0),
        helper: "Probabilidad central de que el próximo cierre favorezca la señal.",
      });
    }
    if (bestPrediction.sigma != null) {
      rows.push({
        label: "Incertidumbre σ",
        value: formatPercent(bestPrediction.sigma, 1),
        helper: "Desviación respecto al escenario central; valores altos implican más ruido.",
      });
    }
    if (bestPrediction.margin != null) {
      rows.push({
        label: "Margen esperado",
        value: formatPercent(bestPrediction.margin, 1),
        helper: "Ganancia estimada ponderando el riesgo del modelo.",
      });
    }
    if (bestPrediction.quality != null) {
      const numericQuality =
        typeof bestPrediction.quality === "number" ? bestPrediction.quality : Number(bestPrediction.quality);
      if (!Number.isNaN(numericQuality)) {
        rows.push({
          label: "Calidad de la señal",
          value: formatNumber(numericQuality, 2),
          helper: "Score interno del modelo: >1 indica señales robustas.",
        });
      }
    }
    if (bestPrediction.stops?.tp != null) {
      rows.push({
        label: "Precio objetivo",
        value: formatNumber(bestPrediction.stops.tp, 4),
        helper: "Nivel donde el modelo recomienda tomar ganancias.",
      });
    }
    if (bestPrediction.stops?.sl != null) {
      rows.push({
        label: "Precio de protección",
        value: formatNumber(bestPrediction.stops.sl, 4),
        helper: "Nivel sugerido para limitar la pérdida en caso adverso.",
      });
    }
    if (bestPrediction.thr_buy != null) {
      rows.push({
        label: "Umbral de compra",
        value: formatPercent(bestPrediction.thr_buy, 0),
        helper: "Probabilidad mínima para habilitar una señal de compra.",
      });
    }
    if (bestPrediction.thr_sell != null) {
      rows.push({
        label: "Umbral de venta",
        value: formatPercent(bestPrediction.thr_sell, 0),
        helper: "Probabilidad mínima para habilitar una señal de venta.",
      });
    }
    if (bestPrediction.ci_low != null && bestPrediction.ci_high != null) {
      rows.push({
        label: "Intervalo de confianza",
        value: `${formatPercent(bestPrediction.ci_low, 0)} – ${formatPercent(bestPrediction.ci_high, 0)}`,
        helper: "Rango probable según la simulación del modelo.",
      });
    }
    if (bestPrediction.mc_passes != null) {
      rows.push({
        label: "Monte Carlo",
        value: formatNumber(bestPrediction.mc_passes, 0),
        helper: "Cantidad de simulaciones utilizadas para la estimación.",
      });
    }
    if (bestPrediction.model_kind) {
      rows.push({
        label: "Modelo",
        value: bestPrediction.model_kind,
        helper: "Arquitectura que generó esta recomendación.",
      });
    }
    return rows;
  }, [bestPrediction]);

  const baselinePrice = useMemo(() => {
    if (!bestPrediction) return null;
    if (bestPrediction.action === "BUY" && bestPrediction.stops?.tp != null) return bestPrediction.stops.tp;
    if (bestPrediction.action === "SELL" && bestPrediction.stops?.sl != null) return bestPrediction.stops.sl;
    return null;
  }, [bestPrediction]);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      {/* más ancho total que 6xl */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between" data-tour="asset-header">
          <div className="flex flex-wrap items-center gap-2">
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
          <div className="mt-4 border-t border-white/10 pt-4 space-y-2">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <span className="text-sm font-semibold">Predicción del modelo</span>
              {predictionLoading && <span className="text-xs opacity-60">Cargando…</span>}
            </div>
            {predictionLoading ? (
              <div className="h-14 rounded-lg bg-white/5 animate-pulse" />
            ) : predictionError ? (
              <div className="text-xs text-rose-300">{predictionError}</div>
            ) : predictionNarratives.length > 0 ? (
              <ul className="space-y-1 text-xs leading-relaxed">
                {predictionNarratives.map((entry) => (
                  <li key={entry.key} className="flex gap-2">
                    <span className="mt-1 h-1 w-1 rounded-full bg-[--primary]" />
                    <span>{entry.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-xs opacity-70">
                Aún no contamos con una señal reciente para este activo. Revisa más tarde o cambia el horizonte.
              </div>
            )}
          </div>
        </section>

        <div className="mb-4 space-y-3" data-tour="asset-price">
          <RealtimePrice assetId={symbol} className="flex flex-wrap items-center gap-2 text-sm px-3 py-2 rounded bg-white/5 border border-white/10" />
          <PriceTicker symbol={symbol} price={last} deltaPct={rangeDelta ?? null} />
        </div>

        {/* WS Debug deshabilitado para modo 100% local */}


        {/* grid de 2 columnas: chart flexible + panel de ancho fijo */}
        <section className="gap-6 grid
                            lg:grid-cols-[minmax(0,1fr)_340px]
                            xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-h-[380px] xl:min-h-[520px] min-w-0" data-tour="chart-canvas">
            <MarketChartE
              symbol={symbol}
              tf="5m"
              height={440}
              onPrice={setLast}
              baseline={baselinePrice}
              showLastPrice
              onRangeDelta={(d: number, r: RangeBtn) => { setRangeDelta(d); setRangeLabel(r); }}  
            />
            {baselinePrice != null && (
              <p className="mt-2 text-xs opacity-70">
                La línea punteada marca el objetivo sugerido por el modelo ({formatNumber(baselinePrice, 2)}).
              </p>
            )}
          </div>

          <div data-tour="asset-trade">
            <TradePanel symbol={symbol} lastPrice={last} />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="card p-4 space-y-3" data-tour="signal-explanation">
            <div>
              <div className="text-sm font-semibold mb-2">Cómo leer el indicador predictivo</div>
              <p className="text-sm leading-relaxed">{indicatorSummary}</p>
            </div>
            {indicatorMetrics.length > 0 && (
              <dl className="grid gap-3 sm:grid-cols-2 text-xs">
                {indicatorMetrics.map((row) => (
                  <div key={row.label} className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-1.5">
                    <dt className="text-[11px] uppercase tracking-wide opacity-70">{row.label}</dt>
                    <dd className="text-sm font-semibold text-white">{row.value}</dd>
                    <dd className="text-[11px] opacity-70 leading-relaxed">{row.helper}</dd>
                  </div>
                ))}
              </dl>
            )}
            {!predictionLoading && !bestPrediction && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs opacity-70">
                Cuando el feed envíe una señal relevante la verás resumida aquí.
              </div>
            )}
          </div>
          <div className="card p-4" data-tour="asset-news">
            <NewsList
              title="Noticias que pueden mover este activo"
              items={symbolNews}
              loading={newsLoading}
              error={newsError}
              emptyMessage="Sin titulares recientes relacionados con este símbolo."
              highlightSymbols={[symbol]}
            />
          </div>
        </section>
      </div>
    </main>
  );
}





