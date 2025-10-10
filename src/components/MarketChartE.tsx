"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts/core";
import { CandlestickChart, BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, DataZoomComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

import { useLiveMarket } from "@/hooks/useLiveMarket";
import type { YahooRange } from "@/hooks/useLiveMarket";
import type { CallbackDataParams } from "echarts/types/dist/shared";
import { useAuraStream } from "@/hooks/useAuraStream";
import type { Provider as StreamProvider } from "@/hooks/useAuraStream";

// Registrar sólo lo necesario (simple)
echarts.use([CandlestickChart, BarChart, GridComponent, TooltipComponent, DataZoomComponent, CanvasRenderer]);

// Tipos exportados (compatibilidad con páginas que importan estos tipos)
export type TF = "5m" | "15m" | "1h" | "4h" | "1d";
export type Candle = { t: number; o: number; h: number; l: number; c: number; v?: number };
export type RangeBtn = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "MAX";

export type Props = {
  symbol: string;
  provider?: "yahoo" | "binance" | "auto";
  tf?: TF;
  height?: number;
  className?: string;
  // Compat: props que otras pantallas ya pasan (no usadas o usadas mínimamente)
  baseline?: number | null;
  showLastPrice?: boolean;
  showGaps?: boolean;             // ignorado en versión simple
  emaDurationsMin?: number[];      // ignorado en versión simple
  showTips?: boolean;              // ignorado en versión simple
  onPrice?: (p: number) => void;
  onRangeDelta?: (deltaPct: number, label: RangeBtn) => void;
  maxCandleRefreshMs?: number;
  wsPriceProvider?: StreamProvider; // proveedor WS opcional
};

const TF_MIN: Record<TF, number> = { "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440 };

function mapYahooRange(provider: string | undefined, tf: TF, range: RangeBtn): YahooRange | undefined {
  if (provider !== "yahoo") return undefined;
  if (tf === "1d") {
    if (range === "1M") return "1mo";
    if (range === "3M") return "3mo";
    if (range === "6M") return "6mo";
    if (range === "1Y") return "1y";
    if (range === "MAX") return "max";
    return "1mo"; // 1D/1W en diario: trae 1 mes y se recorta en cliente
  }
  // Intradía (5m/15m/1h/4h) → usar 5d
  return "5d";
}

function barsFor(range: RangeBtn, tf: TF, total: number): number {
  if (range === "MAX") return total;
  const minutes =
    range === "1D" ? 1440 :
    range === "1W" ? 7 * 1440 :
    range === "1M" ? 30 * 1440 :
    range === "3M" ? 90 * 1440 :
    range === "6M" ? 180 * 1440 :
    365 * 1440;
  const perBar = TF_MIN[tf];
  return Math.max(1, Math.floor(minutes / perBar));
}

export default function MarketChartE({
  symbol,
  provider = "yahoo",
  tf = "5m",
  height = 440,
  className,
  baseline = null,
  showLastPrice = true,
  onPrice,
  onRangeDelta,
  maxCandleRefreshMs = 60_000,
  wsPriceProvider,
}: Props) {
  // Theme-aware colors from CSS variables
  const [themeKey, setThemeKey] = useState<string>('init');
  useEffect(() => {
    const root = document.documentElement;
    const get = () => (root.getAttribute('data-theme') === 'day' ? 'day' : 'night');
    setThemeKey(get());
    const mo = new MutationObserver(() => setThemeKey(get()));
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  const chartColors = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fb: string) => (cs.getPropertyValue(name).trim() || fb);
    return {
      label: v('--chart-label', themeKey === 'day' ? 'rgba(11,18,32,0.70)' : 'rgba(234,240,246,0.72)'),
      axis:  v('--chart-axis',  themeKey === 'day' ? 'rgba(11,18,32,0.30)' : 'rgba(234,240,246,0.24)'),
      grid:  v('--chart-grid',  themeKey === 'day' ? 'rgba(11,18,32,0.10)' : 'rgba(234,240,246,0.08)'),
      ttBg:  v('--chart-tooltip-bg', themeKey === 'day' ? 'rgba(255,255,255,0.96)' : 'rgba(20,20,24,0.94)'),
      ttFg:  v('--chart-tooltip-fg', themeKey === 'day' ? 'rgba(11,18,32,0.95)' : 'rgba(255,255,255,0.92)'),
    };
  }, [themeKey]);
  const [timeframe, setTimeframe] = useState<TF>(tf);
  const [range, setRange] = useState<RangeBtn>("MAX");
  const [chartKind, setChartKind] = useState<"candles" | "line">("candles");

  // Pedimos un rango adecuado al backend y recortamos en cliente
  const yahooRangeParam = useMemo(() => mapYahooRange(provider, timeframe, range), [provider, timeframe, range]);

  const { candles, lastPrice } = useLiveMarket({
    symbol,
    provider,
    tf: timeframe,
    range: yahooRangeParam,
    refreshMs: maxCandleRefreshMs,
  });

  // WS precio en tiempo real (opcional)
  const { subscribe, unsubscribe, ticks } = useAuraStream();
  const [wsPrice, setWsPrice] = useState<number | null>(null);
  useEffect(() => {
    const p: StreamProvider | undefined = wsPriceProvider ?? (provider === "auto" ? undefined : (provider as StreamProvider));
    if (!p) { setWsPrice(null); return; }
    subscribe(symbol, p);
    const key = `${p}|${symbol}`;
    const id = window.setInterval(() => {
      const arr = (ticks as Record<string, { price: number }[]>)[key] ?? [];
      const last = arr.length ? arr[arr.length - 1].price : null;
      setWsPrice(last != null && Number.isFinite(last) ? last : null);
    }, 1000);
    return () => { unsubscribe(symbol, p); window.clearInterval(id); };
  }, [symbol, provider, wsPriceProvider, subscribe, unsubscribe, ticks]);

  // Último precio hacia el padre (prioriza WS)
  useEffect(() => {
    const p = wsPrice ?? lastPrice;
    if (onPrice && p != null && Number.isFinite(p)) onPrice(p);
  }, [wsPrice, lastPrice, onPrice]);

  // Recorte por ventana visible
  const sliced = useMemo(() => {
    const n = candles.length;
    const wanted = barsFor(range, timeframe, n);
    const start = Math.max(0, n - wanted);
    return candles.slice(start);
  }, [candles, range, timeframe]);

  // Delta % del rango visible (sin dataZoom aún)
  const [visibleStart, setVisibleStart] = useState<number>(0);
  useEffect(() => { setVisibleStart(0); }, [timeframe, range, candles.length]);

  useEffect(() => {
    if (!onRangeDelta) return;
    const n = candles.length;
    if (!n) return;
    const idx = Math.max(0, Math.min(visibleStart, n - 1));
    const base = candles[idx]?.c;
    const ref = (wsPrice ?? lastPrice ?? candles[n - 1]?.c);
    if (base && ref) onRangeDelta((ref / base - 1) * 100, range);
  }, [candles, visibleStart, lastPrice, wsPrice, range, onRangeDelta]);

  const x = useMemo(
    () => sliced.map((c) => {
      const d = new Date(c.t);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mi = String(d.getUTCMinutes()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    }),
    [sliced]
  );

  const kData = useMemo(() => sliced.map((c) => [c.o, c.c, c.l, c.h] as [number, number, number, number]), [sliced]);
  const vData = useMemo(
    () => sliced.map((c) => ({ value: c.v ?? 0, itemStyle: { color: c.c >= c.o ? "#34d399" : "#f87171" } })),
    [sliced]
  );

  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      animation: false,
      grid: [
        { left: 48, right: 12, top: 10, height: Math.round(height * 0.70), containLabel: true },
        { left: 48, right: 12, top: Math.round(height * 0.74), height: Math.round(height * 0.20), containLabel: true },
      ],
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross", link: [{ xAxisIndex: [0,1] }], label: { backgroundColor: chartColors.ttBg } },
        backgroundColor: chartColors.ttBg,
        borderWidth: 0,
        textStyle: { color: chartColors.ttFg },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? (params as CallbackDataParams[]) : [];
          const targetType = chartKind === 'candles' ? 'candlestick' : 'line';
          const k = arr.find((p: CallbackDataParams) => p.seriesType === targetType);
          if (!k) return '';
          const name = typeof k.name === 'string' ? k.name : '';
          if (chartKind === 'line') {
            const c = typeof k.data === 'number' ? k.data : null;
            return c != null ? `${name}<br/>Precio: ${c.toFixed(6)}` : name;
          }
          if (!Array.isArray(k.data)) return name;
          const [o, c, l, h] = k.data as [number, number, number, number];
          const diff = c - o; const pct = o ? (diff / o) * 100 : 0;
          const sign = diff >= 0 ? '+' : '';
          return [
            `<div style="font-weight:600;margin-bottom:4px">${name}</div>`,
            `Abre: ${o.toFixed(6)} • Máx: ${h.toFixed(6)}`,
            `Mín: ${l.toFixed(6)} • Cierra: ${c.toFixed(6)}`,
            `<span style="color:${diff>=0?'#34d399':'#f87171'}">Cambio: ${sign}${diff.toFixed(6)} (${sign}${pct.toFixed(2)}%)</span>`,
          ].join('<br/>');
        },
      },
      xAxis: [
        { type: "category", data: x, boundaryGap: true, axisLine: { lineStyle: { color: chartColors.axis } }, axisLabel: { color: chartColors.label, hideOverlap: true, margin: 8 }, axisTick: { show: false }, min: "dataMin", max: "dataMax" },
        { type: "category", gridIndex: 1, data: x, boundaryGap: true, axisLine: { lineStyle: { color: chartColors.axis } }, axisLabel: { color: chartColors.label, hideOverlap: true, margin: 2 }, axisTick: { show: false }, min: "dataMin", max: "dataMax" },
      ],
      yAxis: [
        { type: "value", scale: true, splitLine: { lineStyle: { color: chartColors.grid } }, axisLine: { lineStyle: { color: chartColors.axis } }, axisLabel: { color: chartColors.label } },
        { gridIndex: 1, type: "value", scale: true, splitLine: { show: false }, axisLine: { lineStyle: { color: chartColors.axis } }, axisLabel: { color: chartColors.label } },
      ],
      dataZoom: [
        { type: "inside", xAxisIndex: [0,1], filterMode: "filter", throttle: 50, minValueSpan: 5 },
        { type: "slider", xAxisIndex: [0,1], filterMode: "filter", height: 18, bottom: 0 },
      ],
      series: [
        (
          // Toggle entre velas y línea
          chartKind === "candles"
            ? {
                name: "Precio",
                type: "candlestick" as const,
                data: kData,
                itemStyle: { color: "#34d399", color0: "#f87171", borderColor: "#34d399", borderColor0: "#f87171" },
                markLine:
                  showLastPrice && (wsPrice ?? lastPrice ?? null) != null
                    ? {
                        symbol: "none",
                        data: [
                          {
                            yAxis: (wsPrice ?? lastPrice) as number,
                            lineStyle: { color: "#9aa0a6", width: 1 },
                            label: { show: true, formatter: () => `Último: ${(wsPrice ?? (lastPrice as number)).toFixed(4)}` },
                          },
                          ...(baseline != null
                            ? [{ yAxis: baseline, lineStyle: { color: "#ffd166", type: "dashed", width: 1 }, label: { show: true, formatter: () => `AURA: ${(baseline as number).toFixed(4)}` } }]
                            : []),
                        ],
                      }
                    : undefined,
              }
            : {
                name: "Precio",
                type: "line" as const,
                data: candles.map((c) => c.c),
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 2, color: "#58acff" },
                markLine:
                  showLastPrice && (wsPrice ?? lastPrice ?? null) != null
                    ? { symbol: "none", data: [{ yAxis: (wsPrice ?? lastPrice) as number, lineStyle: { color: "#9aa0a6", width: 1 }, label: { show: true, formatter: () => `Último: ${(wsPrice ?? (lastPrice as number)).toFixed(4)}` } }] }
                    : undefined,
              }
        ),
        { name: "Volumen", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: vData, barMaxWidth: 8, barMinWidth: 2, barCategoryGap: "60%" },
      ],
    }),
    [x, kData, vData, height, showLastPrice, lastPrice, wsPrice, baseline, chartKind, candles, chartColors]
  );

  const onDataZoom = useCallback((ev: unknown) => {
    const e = ev as { startValue?: number; batch?: Array<{ startValue?: number }> };
    const sv = e?.batch?.[0]?.startValue ?? e?.startValue;
    if (typeof sv === "number") setVisibleStart(sv);
  }, []);

  const setRangeAndMaybeDaily = (r: RangeBtn) => {
    setRange(r);
    if ((r === "1M" || r === "3M" || r === "6M" || r === "1Y" || r === "MAX") && timeframe !== "1d") {
      setTimeframe("1d");
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2 px-2 py-2 text-xs">
        <div className="flex gap-1">
          {(["5m", "15m", "1h", "4h", "1d"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTimeframe(t)} className={`px-2 py-1 rounded ${timeframe === t ? "bg-white/10" : "bg-white/5"}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="mx-3 h-4 w-px bg-white/10" />
        <div className="flex gap-1">
          {(["1D", "1W", "1M", "3M", "6M", "1Y", "MAX"] as const).map((r) => (
            <button key={r} type="button" onClick={() => setRangeAndMaybeDaily(r)} className={`px-2 py-1 rounded ${range === r ? "bg-white/10" : "bg-white/5"}`}>
              {r}
            </button>
          ))}
        </div>
        <div className="mx-3 h-4 w-px bg-white/10" />
        <div className="flex gap-1">
          <button
            type="button"
            className={`px-2 py-1 rounded ${chartKind === "candles" ? "bg-white/10" : "bg-white/5"}`}
            onClick={() => setChartKind("candles")}
            title="Velas (cada barra muestra abrir/alto/bajo/cerrar)"
          >
            Velas
          </button>
          <button
            type="button"
            className={`px-2 py-1 rounded ${chartKind === "line" ? "bg-white/10" : "bg-white/5"}`}
            onClick={() => setChartKind("line")}
            title="Línea (muestra el precio de cierre)"
          >
            Línea
          </button>
        </div>
      </div>

      <ReactECharts option={option} style={{ width: "100%", height }} notMerge lazyUpdate onEvents={{ dataZoom: onDataZoom, datazoom: onDataZoom }} />
    </div>
  );
}
