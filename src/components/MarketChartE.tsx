"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts/core";
import { CandlestickChart, BarChart, LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, DataZoomComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { CallbackDataParams } from "echarts/types/dist/shared";
import PriceChangeBadge from "@/components/PriceChangeBadge";
import { mapSymbol } from "@/lib/market";

echarts.use([CandlestickChart, LineChart, BarChart, GridComponent, TooltipComponent, DataZoomComponent, CanvasRenderer]);

export type TF = "5m" | "15m" | "1h" | "4h" | "1d";
export type Candle = { t: number; o: number; h: number; l: number; c: number; v?: number };
export type RangeBtn = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "MAX";

export type Props = {
  symbol: string;
  tf?: TF;
  height?: number;
  className?: string;
  baseline?: number | null;
  showLastPrice?: boolean;
  onPrice?: (p: number) => void;
  onRangeDelta?: (deltaPct: number, label: RangeBtn) => void;
};

const TF_MIN: Record<TF, number> = { "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440 };

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

function readCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function yahooParams(tf: TF, range: RangeBtn): { interval: "5m" | "15m" | "60m" | "1d"; range: string } {
  if (tf === "1d") {
    if (range === "1M") return { interval: "1d", range: "1mo" };
    if (range === "3M") return { interval: "1d", range: "3mo" };
    if (range === "6M") return { interval: "1d", range: "6mo" };
    if (range === "1Y") return { interval: "1d", range: "1y" };
    if (range === "MAX") return { interval: "1d", range: "max" };
    return { interval: "1d", range: "1mo" };
  }
  if (range === "1D" || range === "1W") {
    const interval: "5m" | "15m" | "60m" = tf === "5m" ? "5m" : tf === "15m" ? "15m" : "60m";
    return { interval, range: "5d" };
  }
  if (range === "1M") return { interval: "60m", range: "1mo" };
  if (range === "3M") return { interval: "60m", range: "3mo" };
  if (range === "6M") return { interval: "60m", range: "6mo" };
  if (range === "1Y") return { interval: "1d", range: "1y" };
  return { interval: "1d", range: "max" };
}

function mergeCandleSeries(prev: Candle[], incoming: Candle[]): Candle[] {
  if (!incoming.length) return prev;
  if (!prev.length) return incoming;

  const lastPrevTs = prev[prev.length - 1]?.t ?? 0;
  const appended = incoming.filter((c) => c.t > lastPrevTs);
  let next = appended.length ? [...prev, ...appended] : prev;
  let changed = appended.length > 0;

  const latestIncoming = incoming[incoming.length - 1];
  if (latestIncoming) {
    const idx = next.findIndex((c) => c.t === latestIncoming.t);
    if (idx !== -1) {
      const existing = next[idx];
      if (
        existing.o !== latestIncoming.o ||
        existing.h !== latestIncoming.h ||
        existing.l !== latestIncoming.l ||
        existing.c !== latestIncoming.c ||
        (existing.v ?? 0) !== (latestIncoming.v ?? 0)
      ) {
        if (next === prev) next = [...prev];
        next[idx] = latestIncoming;
        changed = true;
      }
    }
  }

  return changed ? next : prev;
}

export default function MarketChartE({
  symbol,
  tf = "5m",
  height = 440,
  className,
  baseline = null,
  showLastPrice = true,
  onPrice,
  onRangeDelta,
}: Props) {
  const [timeframe, setTimeframe] = useState<TF>(tf);
  const [range, setRange] = useState<RangeBtn>("MAX");
  const [chartKind, setChartKind] = useState<"candles" | "line">("candles");
  const [seed, setSeed] = useState<Candle[]>([]);

  const fetchYahooCandles = useCallback(
    async (interval: string, rg: string): Promise<Candle[]> => {
      const ySymbol = mapSymbol("yahoo", symbol);
      const url = `/api/yahoo/candles?symbol=${encodeURIComponent(ySymbol)}&interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(rg)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return [];
      const json = (await res.json()) as { candles?: Candle[] };
      return Array.isArray(json.candles) ? json.candles : [];
    },
    [symbol]
  );

  const loadCandlesWithFallback = useCallback(
    async (interval: string, rg: string): Promise<Candle[]> => {
      const attempts: Array<[string, string]> = [
        [interval, rg],
        ["60m", "1mo"],
        ["1d", "1y"],
        ["1d", "max"],
      ];
      for (const [iv, rangeValue] of attempts) {
        const candles = await fetchYahooCandles(iv, rangeValue);
        if (candles.length >= 2) return candles;
      }
      return [];
    },
    [fetchYahooCandles]
  );

  useEffect(() => {
    const { interval, range: r } = yahooParams(timeframe, range);
    let alive = true;
    (async () => {
      try {
        const candles = await loadCandlesWithFallback(interval, r);
        if (!alive) return;
        setSeed(candles);
      } catch {
        if (!alive) return;
        setSeed([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [timeframe, range, loadCandlesWithFallback]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pollMs = timeframe === "1d" ? 60_000 : 15_000;
    if (!Number.isFinite(pollMs) || pollMs <= 0) return;

    let alive = true;
    const { interval, range: r } = yahooParams(timeframe, range);

    const tick = async () => {
      try {
        const candles = await loadCandlesWithFallback(interval, r);
        if (!alive || candles.length === 0) return;
        setSeed((prev) => mergeCandleSeries(prev, candles));
      } catch {
        /* ignore poll errors */
      }
    };

    const id = window.setInterval(() => {
      void tick();
    }, pollMs);

    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [timeframe, range, loadCandlesWithFallback]);

  const displayCandles = seed;

  useEffect(() => {
    if (displayCandles.length < 2 && chartKind === "candles") setChartKind("line");
  }, [displayCandles.length, chartKind]);

  const lastPrice = useMemo<number | null>(() => {
    const n = displayCandles.length;
    return n ? displayCandles[n - 1].c : null;
  }, [displayCandles]);

  useEffect(() => {
    if (onPrice && lastPrice != null && Number.isFinite(lastPrice)) onPrice(lastPrice);
  }, [lastPrice, onPrice]);

  const sliced = useMemo(() => {
    const total = displayCandles.length;
    const wanted = barsFor(range, timeframe, total);
    const start = Math.max(0, total - wanted);
    return displayCandles.slice(start);
  }, [displayCandles, range, timeframe]);

  const sliced2 = useMemo(() => {
    if (sliced.length >= 2) return sliced;
    if (sliced.length === 1) {
      const only = sliced[0];
      const tfMs =
        timeframe === "5m" ? 5 * 60_000 :
        timeframe === "15m" ? 15 * 60_000 :
        timeframe === "1h" ? 60 * 60_000 :
        timeframe === "4h" ? 4 * 60 * 60_000 :
        24 * 60 * 60_000;
      return [only, { ...only, t: only.t + tfMs }];
    }
    return sliced;
  }, [sliced, timeframe]);

  const [visibleStart, setVisibleStart] = useState<number>(0);
  useEffect(() => {
    setVisibleStart(0);
  }, [timeframe, range, displayCandles.length]);

  useEffect(() => {
    if (!onRangeDelta) return;
    const total = displayCandles.length;
    if (!total) return;
    const idx = Math.max(0, Math.min(visibleStart, total - 1));
    const base = displayCandles[idx]?.c;
    const ref = lastPrice ?? displayCandles[total - 1]?.c;
    if (base && ref) onRangeDelta((ref / base - 1) * 100, range);
  }, [displayCandles, visibleStart, lastPrice, range, onRangeDelta]);

  const xLabels = useMemo(
    () =>
      sliced2.map((c) => {
        const d = new Date(c.t);
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        const hh = String(d.getUTCHours()).padStart(2, "0");
        const mi = String(d.getUTCMinutes()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
      }),
    [sliced2]
  );

  const kData = useMemo(
    () => sliced2.map((c) => [c.o, c.c, c.l, c.h] as [number, number, number, number]),
    [sliced2]
  );
  const vData = useMemo(
    () => sliced2.map((c) => ({ value: c.v ?? 0, itemStyle: { color: c.c >= c.o ? "#34d399" : "#f87171" } })),
    [sliced2]
  );

  const chartColors = useMemo(
    () => ({
      axis: readCssVar("--border", "#3c4043"),
      label: readCssVar("--muted-foreground", "#c3c7cf"),
      grid: readCssVar("--muted", "rgba(255,255,255,0.06)"),
      ttBg: readCssVar("--popover", "rgba(25,25,28,0.95)"),
      ttFg: readCssVar("--popover-foreground", "#e5e7eb"),
    }),
    []
  );

  const priceMarkLine = useMemo(() => {
    const data: Array<{
      yAxis: number;
      lineStyle: { color: string; width: number; type?: "solid" | "dashed" | "dotted" };
      label: { show: boolean; formatter: () => string; color?: string };
    }> = [];
    if (baseline != null && Number.isFinite(baseline)) {
      const value = baseline;
      data.push({
        yAxis: value,
        lineStyle: { color: "#fbbf24", width: 1, type: "dashed" },
        label: { show: true, formatter: () => `Base: ${value.toFixed(4)}`, color: "#fbbf24" },
      });
    }
    if (showLastPrice && lastPrice != null && Number.isFinite(lastPrice)) {
      const value = lastPrice;
      data.push({
        yAxis: value,
        lineStyle: { color: "#9aa0a6", width: 1 },
        label: { show: true, formatter: () => `Ultimo: ${value.toFixed(4)}` },
      });
    }
    return data.length ? { symbol: "none" as const, data } : undefined;
  }, [baseline, showLastPrice, lastPrice]);

  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      animation: false,
      grid: [
        { left: 48, right: 12, top: 10, height: Math.round(height * 0.7), containLabel: true },
        { left: 48, right: 12, top: Math.round(height * 0.74), height: Math.round(height * 0.2), containLabel: true },
      ],
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross", link: [{ xAxisIndex: [0, 1] }], label: { backgroundColor: chartColors.ttBg } },
        backgroundColor: chartColors.ttBg,
        borderWidth: 0,
        textStyle: { color: chartColors.ttFg },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? (params as CallbackDataParams[]) : [];
          const targetType = chartKind === "candles" ? "candlestick" : "line";
          const hit = arr.find((p) => p.seriesType === targetType);
          if (!hit) return "";
          const name = typeof hit.name === "string" ? hit.name : "";
          if (chartKind === "line") {
            const c = typeof hit.data === "number" ? hit.data : null;
            return c != null ? `${name}<br/>Close: ${c.toFixed(6)}` : name;
          }
          if (!Array.isArray(hit.data)) return name;
          const [o, c, l, h] = hit.data as [number, number, number, number];
          const diff = c - o;
          const pct = o ? (diff / o) * 100 : 0;
          const sign = diff >= 0 ? "+" : "";
          return [
            `<div style="font-weight:600;margin-bottom:4px">${name}</div>`,
            `Open: ${o.toFixed(6)} / High: ${h.toFixed(6)}`,
            `Low: ${l.toFixed(6)} / Close: ${c.toFixed(6)}`,
            `<span style="color:${diff >= 0 ? "#34d399" : "#f87171"}">Change: ${sign}${diff.toFixed(6)} (${sign}${pct.toFixed(2)}%)</span>`,
          ].join("<br/>");
        },
      },
      xAxis: [
        {
          type: "category",
          data: xLabels,
          boundaryGap: true,
          axisLine: { lineStyle: { color: chartColors.axis } },
          axisLabel: { color: chartColors.label, hideOverlap: true, margin: 8 },
          axisTick: { show: false },
          min: "dataMin",
          max: "dataMax",
        },
        {
          type: "category",
          gridIndex: 1,
          data: xLabels,
          boundaryGap: true,
          axisLine: { lineStyle: { color: chartColors.axis } },
          axisLabel: { color: chartColors.label, hideOverlap: true, margin: 2 },
          axisTick: { show: false },
          min: "dataMin",
          max: "dataMax",
        },
      ],
      yAxis: [
        { type: "value", scale: true, splitLine: { lineStyle: { color: chartColors.grid } }, axisLine: { lineStyle: { color: chartColors.axis } }, axisLabel: { color: chartColors.label } },
        { gridIndex: 1, type: "value", scale: true, splitLine: { show: false }, axisLine: { lineStyle: { color: chartColors.axis } }, axisLabel: { color: chartColors.label } },
      ],
      dataZoom: [
        { type: "inside", xAxisIndex: [0, 1], filterMode: "filter", throttle: 50, minValueSpan: 5 },
        { type: "slider", xAxisIndex: [0, 1], filterMode: "filter", height: 18, bottom: 0 },
      ],
      series: [
        chartKind === "candles"
          ? {
              name: "Precio",
              type: "candlestick" as const,
              data: kData,
              itemStyle: { color: "#34d399", color0: "#f87171", borderColor: "#34d399", borderColor0: "#f87171" },
              markLine: priceMarkLine,
            }
          : {
              name: "Precio",
              type: "line" as const,
              data: sliced2.map((c) => c.c),
              smooth: true,
              showSymbol: false,
              lineStyle: { width: 2, color: "#58acff" },
              markLine: priceMarkLine,
            },
        { name: "Volumen", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: vData, barMaxWidth: 8, barMinWidth: 2, barCategoryGap: "60%" },
      ],
    }),
    [xLabels, kData, vData, height, chartKind, chartColors, sliced2, priceMarkLine]
  );

  const onDataZoom = useCallback((ev: unknown) => {
    const e = ev as { startValue?: number; batch?: Array<{ startValue?: number }> };
    const sv = e?.batch?.[0]?.startValue ?? e?.startValue;
    if (typeof sv === "number") setVisibleStart(sv);
  }, []);

  const setRangeAndMaybeDaily = (next: RangeBtn) => {
    setRange(next);
    if ((next === "1M" || next === "3M" || next === "6M" || next === "1Y" || next === "MAX") && timeframe !== "1d") {
      setTimeframe("1d");
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2 px-2 py-2 text-xs">
        <PriceChangeBadge value={lastPrice ?? null} />
        <div className="mx-3 h-4 w-px bg-white/10" />
        <div className="flex gap-1">
          {(["5m", "15m", "1h", "4h", "1d"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTimeframe(t)}
              className={`px-2 py-1 rounded ${timeframe === t ? "bg-white/10" : "bg-white/5"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mx-3 h-4 w-px bg-white/10" />
        <div className="flex gap-1">
          {(["1D", "1W", "1M", "3M", "6M", "1Y", "MAX"] as const).map((rBtn) => (
            <button
              key={rBtn}
              type="button"
              onClick={() => setRangeAndMaybeDaily(rBtn)}
              className={`px-2 py-1 rounded ${range === rBtn ? "bg-white/10" : "bg-white/5"}`}
            >
              {rBtn}
            </button>
          ))}
        </div>
        <div className="mx-3 h-4 w-px bg-white/10" />
        <div className="flex gap-1">
          <button
            type="button"
            className={`px-2 py-1 rounded ${chartKind === "candles" ? "bg-white/10" : "bg-white/5"}`}
            onClick={() => setChartKind("candles")}
          >
            Velas
          </button>
          <button
            type="button"
            className={`px-2 py-1 rounded ${chartKind === "line" ? "bg-white/10" : "bg-white/5"}`}
            onClick={() => setChartKind("line")}
          >
            Linea
          </button>
        </div>
      </div>

      <ReactECharts option={option} style={{ width: "100%", height }} lazyUpdate onEvents={{ dataZoom: onDataZoom, datazoom: onDataZoom }} />

      {displayCandles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-xs px-3 py-2 rounded bg-white/5 border border-white/10 text-white/70">Cargando historico...</div>
        </div>
      )}
    </div>
  );
}
