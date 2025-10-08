'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import {
  CandlestickChart,
  LineChart,
  BarChart,
} from 'echarts/charts';
import {
  GridComponent,
  DataZoomComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import { useLiveMarket } from '@/hooks/useLiveMarket';
import type { YahooRange } from '@/hooks/useLiveMarket'; // ⬅️ nuevo


import type {
  CandlestickSeriesOption,
  LineSeriesOption,
  BarSeriesOption,
} from 'echarts/charts';
import type {
  GridComponentOption,
  DataZoomComponentOption,
  TooltipComponentOption,
  LegendComponentOption,
} from 'echarts/components';
import type { ComposeOption } from 'echarts/core';

type ECOption = ComposeOption<
  | CandlestickSeriesOption
  | LineSeriesOption
  | BarSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | DataZoomComponentOption
  | LegendComponentOption
>;

// Registrar módulos (tree-shaking)
echarts.use([
  CandlestickChart,
  LineChart,
  BarChart,
  GridComponent,
  DataZoomComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

/** TF soportados (vista tipo Binance) */
type TF = '5m' | '15m' | '1h' | '4h' | '1d';

/** Candle normalizado AURA */
export type Candle = {
  t: number;  // epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
};

/** Deriva el tipo real de provider desde el hook (evita desajustes) */
type LiveProvider = Parameters<typeof useLiveMarket>[0]['provider'];
type RangeBtn = '1D' | '1W' | '1M' | '1Y' | 'ALL';

type Props = {
  symbol: string;
  provider?: LiveProvider;
  tf?: TF;
  onPrice?: (p: number) => void;
  /** EMAs por duración (minutos) para consistencia inter-TF */
  emaDurationsMin?: number[]; // p.ej. [20, 60]
  height?: number;
  className?: string;
  /** Mostrar “gaps” como líneas verticales */
  showGaps?: boolean;
  /** Línea horizontal con la predicción AURA */
  baseline?: number | null;
  /** Mostrar la línea de último precio */
  showLastPrice?: boolean;
  onRangeDelta?: (deltaPct: number, label: RangeBtn) => void;

  useLiveMarketRange?: YahooRange; // ⬅️ nuevo

};

const TF_MIN: Record<TF, number> = { '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440 };

function durationMinToPeriod(mins: number, tf: TF): number {
  const raw = Math.max(2, Math.round(mins / TF_MIN[tf]));
  return raw;
}

// ventanas objetivo (tu “capas”): 1D=5d, 1W=5w, 1M=6m, 1Y=5y
const RANGE_WINDOWS_DAYS: Record<Exclude<RangeBtn, 'ALL'>, number> = {
  '1D': 5,              // últimos 5 días
  '1W': 35,             // 5 semanas
  '1M': 30 * 6,         // ~6 meses
  '1Y': 365 * 5,        // 5 años
};

function barsNeededForRange(r: Exclude<RangeBtn,'ALL'>, tf: TF): number {
  const days = RANGE_WINDOWS_DAYS[r];
  if (tf === '1d') return days;                          // 1 barra = 1 día
  const mins = days * 1440;
  return Math.max(10, Math.floor(mins / TF_MIN[tf]));
}
function emaSeries(candles: Candle[], period: number): (number | null)[] {
  if (period < 2 || candles.length === 0) return [];
  const out: (number | null)[] = new Array(candles.length).fill(null);
  const k = 2 / (period + 1);
  let prev = candles[0].c;
  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i];
    const e = (c.c - prev) * k + prev;
    prev = e;
    out[i] = e;
  }
  return out;
}

// gaps: menos ruido en diario + límite de 60
function detectGapIdx(candles: Candle[], tf: TF): number[] {
  const factorMin = tf === '1d' ? 5 * 1440 : TF_MIN[tf] * 2; // diario: gaps ≥5 días
  const maxGapMs = factorMin * 60_000;
  const out: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const dt = candles[i].t - candles[i - 1].t;
    if (dt > maxGapMs) out.push(i);
  }
  if (out.length > 60) {
    const step = Math.ceil(out.length / 60);
    return out.filter((_, i) => i % step === 0);
  }
  return out;
}

export default function MarketChartE({
  symbol,
  provider = 'yahoo',
  tf = '5m',
  onPrice,
  emaDurationsMin = [20, 60],
  height = 440,
  className,
  showGaps = true,
  baseline = null,
  showLastPrice = true,
  onRangeDelta,
  useLiveMarketRange,              // ⬅️ nuevo
}:  Props) {
  const [timeframe, setTimeframe] = useState<TF>(tf);
  const [range, setRange] = useState<RangeBtn>('ALL');
  const [scaleMode, setScaleMode] = useState<'linear' | 'log'>('linear');

  const [gapsVisible, setGapsVisible] = useState<boolean>(showGaps); // toggle UI

  // Modo % (rebasing dinámico al primer punto visible del rango)
  const [percentMode, setPercentMode] = useState<boolean>(false);
  const [percentBase, setPercentBase] = useState<number | null>(null);

  const [longRange, setLongRange] = useState<YahooRange | undefined>(useLiveMarketRange);



  // Pasa range al hook sólo si estamos en 1d
  const computedRange = useMemo(() => (
    timeframe === '1d' ? longRange : undefined
  ), [timeframe, longRange]);

    // ⬅️ 2) hook antes de efectos que usan `candles`
  const { candles, lastPrice } = useLiveMarket({
    symbol,
    provider,
    tf: timeframe,
    range: computedRange,
    refreshMs: timeframe === '1d' ? 30_000 : 5_000, // 30s diario, 5s intradía
  });
  // Cuando cambian TF o range largo → resetear zoom a ALL
  


  // Rebasar la base % cuando cambian TF o range largo
  useEffect(() => {
    if (candles.length) setPercentBase(candles[0].c);
  }, [timeframe, longRange, candles]); // no uses 'candles[0]?.t' porque el array cambia de ref


  // ⬇️ Hook actualizado: usa lastPrice (no existe 'last') y NO expone setTf
  

  // notifica precio al padre
  useEffect(() => {
    if (onPrice && Number.isFinite(lastPrice ?? NaN)) onPrice(lastPrice as number);
  }, [lastPrice, onPrice]);

  // Inicializa base del modo % cuando llegan velas
  useEffect(() => {
    if (candles.length && percentBase == null) setPercentBase(candles[0].c);
  }, [candles, percentBase]);

  
  /** Datos precomputados */
  const { xCats, kData, volData, emaLines, gapIdx, lastClose, minLow } = useMemo(() => {
    const x = candles.map((c) => {
      const d = new Date(c.t);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mi = String(d.getUTCMinutes()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
    });

    const k = candles.map((c) => [c.o, c.c, c.l, c.h] as [number, number, number, number]);

    const v = candles.map((c) => ({
      value: c.v ?? 0,
      itemStyle: { color: c.c >= c.o ? 'rgba(48,209,88,0.6)' : 'rgba(255,69,58,0.6)' },
    }));

    const emaLinesData = emaDurationsMin.map((dur) => {
      const p = durationMinToPeriod(dur, timeframe);
      return emaSeries(candles, p);
    });

    const gaps = detectGapIdx(candles, timeframe);
    const lc = candles.length ? candles[candles.length - 1].c : null;
    const ml = candles.length ? Math.min(...candles.map((c) => c.l)) : 0.0001;

    return { xCats: x, kData: k, volData: v, emaLines: emaLinesData, gapIdx: gaps, lastClose: lc, minLow: ml };
  }, [candles, timeframe, emaDurationsMin]);

  /** Construir opción de ECharts */
  const option: ECOption = useMemo(() => {
    const isLog = scaleMode === 'log';

    // markLine vertical para gaps (por índice en eje category)
    const gapLines: NonNullable<CandlestickSeriesOption['markLine']>['data'] = gapsVisible 
      ? gapIdx.map((i) => ({
          xAxis: i,
          lineStyle: { color: '#ffb800', width: 1, type: 'dashed' as const },
          label: { show: false },
        }))
      : [];

    // líneas horizontales: último precio y baseline AURA
    const lastPriceLine:
      NonNullable<CandlestickSeriesOption['markLine']>['data'] =
      showLastPrice && lastClose != null
        ? [
            {
              yAxis: lastClose,
              lineStyle: { color: '#9aa0a6', width: 1, type: 'solid' as const },
              label: { show: true, position: 'end' as const, formatter: `Last: ${lastClose.toFixed(4)}` },
            },
          ]
        : [];

    const baselineLine:
      NonNullable<CandlestickSeriesOption['markLine']>['data'] =
      baseline != null
        ? [
            {
              yAxis: baseline,
              lineStyle: { color: '#ffd166', width: 1, type: 'dashed' as const },
              label: { show: true, position: 'end' as const, formatter: `AURA: ${baseline.toFixed(4)}` },
            },
          ]
        : [];

    const markLines = ([...gapLines, ...lastPriceLine, ...baselineLine] as
      NonNullable<CandlestickSeriesOption['markLine']>['data']);

    // seguridad para escala log (evitar <= 0)
    const minForLog = Math.max(0.0000001, minLow * 0.9);

    return {
      backgroundColor: 'transparent',
      animation: false,
      legend: {
        data: ['EMA-A', 'EMA-B'],
        textStyle: { color: 'rgba(255,255,255,0.86)' },
        selectedMode: false,
      },
      grid: [
        { left: 40, right: 12, top: 12, height: Math.round(height * 0.72) },
        { left: 40, right: 12, top: Math.round(height * 0.76), height: Math.round(height * 0.18) },
      ],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: 'rgba(60,60,64,0.9)' } },
        backgroundColor: 'rgba(20,20,24,0.92)',
        borderWidth: 0,
        textStyle: { color: 'rgba(255,255,255,0.92)' },
        formatter: (params: unknown) => {
          const arr = params as CallbackDataParams[];
          const k = Array.isArray(arr) ? arr.find((p) => p.seriesType === 'candlestick') : undefined;
          const emaA = Array.isArray(arr) ? arr.find((p) => p.seriesName === 'EMA-A') : undefined;
          const emaB = Array.isArray(arr) ? arr.find((p) => p.seriesName === 'EMA-B') : undefined;
          if (!k || !Array.isArray(k.data)) return '';
          const [o, c, l, h] = k.data as [number, number, number, number];
          const fmt = (x: number) => (Math.abs(x) >= 1 ? x.toFixed(4) : x.toPrecision(6));
          const emaAVal = emaA && typeof emaA.data === 'number' ? fmt(emaA.data) : '—';
          const emaBVal = emaB && typeof emaB.data === 'number' ? fmt(emaB.data) : '—';
          const axisLabel = typeof k.name === 'string' ? k.name : '';

          const pctLine =
            percentMode && percentBase
              ? `<div style="opacity:.9">Δ: ${(((c / percentBase) - 1) * 100).toFixed(2)}%</div>`
              : '';

          return [
            `<div style="font-weight:600;margin-bottom:4px">${axisLabel}</div>`,
            `O: ${fmt(o)}  H: ${fmt(h)}`,
            `L: ${fmt(l)}  C: ${fmt(c)}`,
            pctLine,
            `<div style="margin-top:6px;font-weight:600">EMAs</div>`,
            `<span style="color:#58acff">EMA-${emaDurationsMin[0]}m</span>: ${emaAVal}`,
            `<span style="color:#00d1b2">EMA-${emaDurationsMin[1]}m</span>: ${emaBVal}`,
          ].join('<br/>');
        },
      },
      xAxis: [
        {
          type: 'category',
          data: xCats,
          boundaryGap: true,
          axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
          axisLabel: { color: 'rgba(255,255,255,0.6)' },
          axisTick: { show: false },
          min: 'dataMin',
          max: 'dataMax',
        },
        {
          type: 'category',
          gridIndex: 1,
          data: xCats,
          boundaryGap: true,
          axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
          axisLabel: { color: 'rgba(255,255,255,0.6)' },
          axisTick: { show: false },
          min: 'dataMin',
          max: 'dataMax',
        },
      ],
      yAxis: [
        {
          type: isLog ? 'log' : 'value',
          min: isLog ? minForLog : undefined,
          scale: true,
          axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
          axisLabel: {
            color: 'rgba(255,255,255,0.6)',
            formatter: (val: number) => {
              if (!percentMode || !percentBase) return `${val}`;
              const pct = ((val / percentBase) - 1) * 100;
              return `${pct.toFixed(2)}%`;
            },
          },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
        },
        {
          gridIndex: 1,
          type: 'value',
          scale: true,
          axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
          axisLabel: { color: 'rgba(255,255,255,0.6)' },
          splitLine: { show: false },
        },
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1], filterMode: 'filter' },
        { type: 'slider', xAxisIndex: [0, 1], filterMode: 'filter', height: 16, bottom: 0 },
      ],
      series: [
        {
          name: 'Precio',
          type: 'candlestick',
          data: kData,
          itemStyle: {
            color: 'rgb(48,209,88)',
            color0: 'rgb(255,69,58)',
            borderColor: 'rgb(48,209,88)',
            borderColor0: 'rgb(255,69,58)',
          },
          markLine: { symbol: 'none', data: markLines },
        },
        {
          name: 'Volumen',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volData,
        },
        {
          name: 'EMA-A',
          type: 'line',
          data: emaLines[0] ?? [],
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: '#58acff' },
          tooltip: { valueFormatter: (v) => (v == null ? '—' : `${v}`) },
        },
        {
          name: 'EMA-B',
          type: 'line',
          data: emaLines[1] ?? [],
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: '#00d1b2' },
          tooltip: { valueFormatter: (v) => (v == null ? '—' : `${v}`) },
        },
      ],
    };
  }, [
    xCats,
    kData,
    volData,
    emaLines,
    gapIdx,
    height,
    emaDurationsMin,
    gapsVisible,
    scaleMode,
    showLastPrice,
    lastClose,
    baseline,
    percentMode,
    percentBase,
    minLow,
  ]);

  /** Cambiar TF: sólo estado local (el hook se re-renderiza con el nuevo tf) */
 const onChangeTF = useCallback((next: TF) => {
    setTimeframe(next);
    if (next !== '1d') setLongRange(undefined); // no enviar range en intradía
  }, []);


  /** Botones de rango → aplican dataZoom al final */
  const chartRef = useRef<ReactECharts>(null);
  const applyRange = useCallback((r: RangeBtn) => {
    if (r === 'ALL') {
      setRange('ALL');
      const inst = chartRef.current?.getEchartsInstance();
      if (!inst) return;
      inst.dispatchAction({ type: 'dataZoom', start: 0, end: 100, xAxisIndex: 0 });
      inst.dispatchAction({ type: 'dataZoom', start: 0, end: 100, xAxisIndex: 1 });
      return;
    }

    // si piden 1M/1Y y estás en intradía → cambiar a 1d y pedir rango largo
    if ((r === '1M' || r === '1Y') && timeframe !== '1d') {
      setTimeframe('1d');
      setLongRange(r === '1M' ? '1mo' : '1y');
      setRange(r);
      return; // cuando llegue el dataset, el efecto de arriba aplicará el zoom
    }

    // ya estamos en 1d (dataset largo) o pidieron 1D/1W en intradía → zoom local a la ventana “capa”
    setRange(r);
    const inst = chartRef.current?.getEchartsInstance();
    if (!inst || xCats.length === 0) return;

    const n = barsNeededForRange(r, timeframe);
    const endIdx = xCats.length - 1;
    const startIdx = Math.max(0, endIdx - n);
    inst.dispatchAction({ type: 'dataZoom', startValue: startIdx, endValue: endIdx, xAxisIndex: 0 });
    inst.dispatchAction({ type: 'dataZoom', startValue: startIdx, endValue: endIdx, xAxisIndex: 1 });
  }, [timeframe, xCats]);


  useEffect(() => {
    const inst = chartRef.current?.getEchartsInstance();
    if (!inst || xCats.length === 0) return;

    if (range === 'ALL') {
      inst.dispatchAction({ type: 'dataZoom', start: 0, end: 100, xAxisIndex: 0 });
      inst.dispatchAction({ type: 'dataZoom', start: 0, end: 100, xAxisIndex: 1 });
    } else {
      const n = barsNeededForRange(range, timeframe);
      const endIdx = xCats.length - 1;
      const startIdx = Math.max(0, endIdx - n);
      inst.dispatchAction({ type: 'dataZoom', startValue: startIdx, endValue: endIdx, xAxisIndex: 0 });
      inst.dispatchAction({ type: 'dataZoom', startValue: startIdx, endValue: endIdx, xAxisIndex: 1 });
    }
  }, [timeframe, longRange, xCats.length, range]);

  /** Captura dataZoom para actualizar base del modo % */
  const onDataZoom = useCallback((ev: unknown) => {
    const e = ev as { startValue?: number; batch?: Array<{ startValue?: number }> };
    const sv = e?.batch?.[0]?.startValue ?? e?.startValue;
    if (typeof sv === 'number' && candles[sv]) setPercentBase(candles[sv].c);
  }, [candles]);

  const onEvents = useMemo(
    () => ({
      dataZoom: onDataZoom,
      datazoom: onDataZoom,
    }),
    [onDataZoom]
  );

  /** Toggle lineal/log */
  const onToggleScale = useCallback((mode: 'linear' | 'log') => {
    setScaleMode(mode);
  }, []);

    // dentro del componente, después de calcular lastClose/percentBase/range:
  useEffect(() => {
    if (!onRangeDelta) return;
    if (percentBase == null || lastClose == null) return;
    const delta = (lastClose / percentBase - 1) * 100;
    onRangeDelta(delta, range);
  }, [onRangeDelta, percentBase, lastClose, range]);

  const Toolbar = useMemo(() => (
    <div className="flex flex-wrap items-center gap-2 px-2 py-2 text-xs">
      <div className="flex gap-1">
        {(['5m','15m','1h','4h','1d'] as const).map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChangeTF(opt)}
            className={`px-2 py-1 rounded ${opt === timeframe ? 'bg-white/10' : 'bg-white/5'} hover:bg-white/15`}
            aria-pressed={opt === timeframe}
          >
            {opt}
          </button>
        ))}
      </div>
      <div className="mx-3 h-4 w-px bg-white/10" />
      <div className="flex gap-1">
        {(['1D','1W','1M','1Y','ALL'] as const).map(r => (
          <button
            key={r}
            type="button"
            onClick={() => applyRange(r)}
            className={`px-2 py-1 rounded ${r === range ? 'bg-white/10' : 'bg-white/5'} hover:bg-white/15`}
            aria-pressed={r === range}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="mx-3 h-4 w-px bg-white/10" />
      <div className="flex items-center gap-1">
        <span className="opacity-70">Escala:</span>
        <button
          type="button"
          onClick={() => onToggleScale('linear')}
          className={`px-2 py-1 rounded ${scaleMode === 'linear' ? 'bg-white/10' : 'bg-white/5'} hover:bg-white/15`}
          aria-pressed={scaleMode === 'linear'}
        >
          Lineal
        </button>
        <button
          type="button"
          onClick={() => onToggleScale('log')}
          className={`px-2 py-1 rounded ${scaleMode === 'log' ? 'bg-white/10' : 'bg-white/5'} hover:bg-white/15`}
          aria-pressed={scaleMode === 'log'}
        >
          Log
        </button>
      </div>
      <div className="mx-3 h-4 w-px bg-white/10" />
      <div className="flex items-center gap-1">
        <span className="opacity-70">Vista:</span>
        <button
          type="button"
          onClick={() => setPercentMode(v => !v)}
          className={`px-2 py-1 rounded ${percentMode ? 'bg-white/10' : 'bg-white/5'} hover:bg-white/15`}
          aria-pressed={percentMode}
        >
          %
        </button>
      </div>
      <div className="mx-3 h-4 w-px bg-white/10" />
      <div className="flex items-center gap-1">
        <span className="opacity-70">Marcas:</span>
        <button
          type="button"
          onClick={() => setGapsVisible(v => !v)}
          className={`px-2 py-1 rounded ${gapsVisible ? 'bg-white/10' : 'bg-white/5'} hover:bg-white/15`}
          aria-pressed={gapsVisible}
        >
          Gaps
        </button>
      </div>
    </div>
  ), [onChangeTF, timeframe, range, applyRange, onToggleScale, scaleMode, percentMode, gapsVisible]);


  
  return (
    <div className={className} role="img" aria-label={`Gráfico de ${symbol} con velas, volumen y EMAs`}>
      {Toolbar}
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ width: '100%', height }}
        notMerge
        lazyUpdate
        theme={undefined}
        onEvents={onEvents}
      />
    </div>
  );
}
