"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadRiskProfile } from "@/lib/invest";

// ----------------- Tipos -----------------
type Horizon = "1d" | "1w";
type Action = "BUY" | "SELL" | "HOLD" | "ABSTAIN";
type ChartType = "line" | "candles";
type Timeframe = "1s" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
type HistoryRange = "auto" | "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y";

type FeedItem = {
  symbol: string;
  ts?: string;
  action: Action;
  p_conf?: number;
  sigma?: number;
  horizon?: string;
  last_close?: number;
  stops?: { tp: number; sl: number } | null;
  quality?: number;
};

type Candle = { t: number; o: number; h: number; l: number; c: number; fin?: boolean; v?: number };
type Tick = { t: number; p: number; v?: number };

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/+$/, "");

// ----------------- Proveedores -----------------
const BINANCE_MAP: Record<string, string> = {
  "BTC-USD": "btcusdt",
  "ETH-USD": "ethusdt",
  "SOL-USD": "solusdt",
  "DOGE-USD": "dogeusdt",
};
function binanceCodeFromSymbol(symbol: string): string | null {
  if (BINANCE_MAP[symbol]) return BINANCE_MAP[symbol];
  const m = symbol.match(/^([A-Z]+)-(?:USD|USDT)$/i);
  if (m && m[1]) return `${m[1].toLowerCase()}usdt`;
  return null;
}
function finnhubCodeFromSymbol(symbol: string): string | null {
  if (/^[A-Z.]+$/.test(symbol) && !symbol.startsWith("^")) return symbol; // acciones/ETF US
  if (/^[A-Z]{6}=X$/.test(symbol)) { // EURUSD=X → OANDA:EUR_USD
    const base = symbol.slice(0, 3);
    const quote = symbol.slice(3, 6);
    return `OANDA:${base}_${quote}`;
  }
  return null;
}
type Provider = { kind: "binance" | "finnhub" | "yahoo"; code: string };
function resolveProvider(symbol: string): Provider | null {
  const b = binanceCodeFromSymbol(symbol);
  if (b) return { kind: "binance", code: b };
  const f = finnhubCodeFromSymbol(symbol);
  if (f) return { kind: "finnhub", code: f };
  if (symbol) return { kind: "yahoo", code: symbol };
  return null;
}

// ----------------- Utilidades -----------------
function actionLabel(a: Action) {
  if (a === "BUY") return "Sube";
  if (a === "SELL") return "Baja";
  if (a === "HOLD") return "En espera";
  return "Sin señal clara";
}
function horizonLabel(h: Horizon) {
  return h === "1w" ? "Próximas semanas" : "Próximos días";
}
async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}
type StopsRaw = { tp?: unknown; sl?: unknown };
function parseStops(x: unknown): { tp: number; sl: number } | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as StopsRaw;
  const tp = typeof o.tp === "number" ? o.tp : Number.NaN;
  const sl = typeof o.sl === "number" ? o.sl : Number.NaN;
  if (Number.isNaN(tp) || Number.isNaN(sl)) return null;
  return { tp, sl };
}
async function getFeed(h: Horizon, minConf: number): Promise<FeedItem[]> {
  if (!API_BASE) return [];
  const qs = new URLSearchParams({ horizon: h, min_conf: String(minConf) });
  const data = await fetchJSON<unknown>(`${API_BASE}/v1/feed?${qs.toString()}`);
  if (!Array.isArray(data)) return [];
  return data
    .map((x) => {
      const o = x as Record<string, unknown>;
      return {
        symbol: String(o.symbol ?? ""),
        ts: typeof o.ts === "string" ? o.ts : undefined,
        action: (["BUY", "SELL", "HOLD", "ABSTAIN"].includes(String(o.action)) ? String(o.action) : "HOLD") as Action,
        p_conf: typeof o.p_conf === "number" ? o.p_conf : undefined,
        sigma: typeof o.sigma === "number" ? o.sigma : undefined,
        horizon: typeof o.horizon === "string" ? o.horizon : undefined,
        last_close: typeof o.last_close === "number" ? o.last_close : undefined,
        stops: parseStops(o.stops),
        quality: typeof o.quality === "number" ? o.quality : undefined,
      } satisfies FeedItem;
    })
    .filter((x) => x.symbol);
}

// ----------------- timeframe helpers -----------------
function tfMs(tf: Timeframe): number {
  switch (tf) {
    case "1s": return 1_000;
    case "1m": return 60_000;
    case "5m": return 5 * 60_000;
    case "15m": return 15 * 60_000;
    case "1h": return 60 * 60_000;
    case "4h": return 4 * 60 * 60_000;
    case "1d": return 24 * 60 * 60_000;
    default: return 60_000;
  }
}
function binanceTf(tf: Timeframe): string { return tf === "1s" ? "1m" : tf; }
function bucketStart(t: number, sizeMs: number): number { return Math.floor(t / sizeMs) * sizeMs; }
function fmtTime(t: number) {
  const d = new Date(t);
  return d.toLocaleString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function autoRangeFor(tf: Timeframe): Exclude<HistoryRange, "auto"> {
  switch (tf) {
    case "1s":
    case "1m": return "5d";
    case "5m":
    case "15m": return "1mo";
    case "1h":
    case "4h": return "6mo";
    case "1d": return "1y";
    default: return "5d";
  }
}

// ----------------- Indicadores -----------------
function ema(series: Candle[], period: number): Array<{ t: number; v: number }> {
  if (!series.length || period <= 1) return [];
  const out: Array<{ t: number; v: number }> = [];
  // Primer valor: SMA(period)
  let sum = 0;
  const take = Math.min(period, series.length);
  for (let i = 0; i < take; i++) sum += series[i].c;
  let prev = sum / take;
  out.push({ t: series[take - 1].t, v: prev });
  const alpha = 2 / (period + 1);
  for (let i = take; i < series.length; i++) {
    const v = alpha * series[i].c + (1 - alpha) * prev;
    prev = v;
    out.push({ t: series[i].t, v });
  }
  return out;
}

// ----------------- Chart types -----------------
type View = {
  w: number;
  h: number;
  priceH: number;
  volH: number;
  sx: (x: number) => number;
  sy: (y: number) => number;
  syVol: (v: number) => number;
  xMin: number;
  xMax: number;
  minY: number;
  maxY: number;
  maxVol: number;
  path: string;
};
type Hover =
  | { kind: "line"; t: number; p: number }
  | { kind: "candle"; c: Candle }
  | null;

// ----------------- Chart -----------------
function RealTimeChart({
  symbol, baseline, tp, sl,
}: {
  symbol: string;
  baseline?: number | null;
  tp?: number | null;
  sl?: number | null;
}) {
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [tf, setTf] = useState<Timeframe>("1m");
  const [histRange, setHistRange] = useState<HistoryRange>("auto");

  const [ticks, setTicks] = useState<Tick[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [last, setLast] = useState<number | null>(baseline ?? null);

  const [hover, setHover] = useState<Hover>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  // Opciones de display
  const [showEMA20, setShowEMA20] = useState(true);
  const [showEMA50, setShowEMA50] = useState(true);
  const [showEMA200, setShowEMA200] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [logScale, setLogScale] = useState(false);

  // Zoom/Pan
  const [follow, setFollow] = useState(true);
  const [windowMs, setWindowMs] = useState(() => tfMs("1m") * 180);
  const [xEnd, setXEnd] = useState<number | null>(null);
  const dragRef = useRef<{ startX: number; startStart: number; startEnd: number } | null>(null);

  const prov = useMemo(() => resolveProvider(symbol), [symbol]);

  // parse helpers
  function parseWsTrade(x: unknown): { p: number; v?: number } | null {
    if (typeof x !== "object" || x === null) return null;

    type TradeShape = {
      p?: number | string;      // precio (Finnhub/Algunos WS)
      price?: number | string;  // precio (Binance)
      q?: number | string;      // cantidad (Binance trade)
      v?: number;               // volumen (Finnhub trade)
    };

    const o = x as TradeShape;

    const rawP = o.p ?? o.price;
    const p =
      typeof rawP === "string" ? Number(rawP) :
      typeof rawP === "number" ? rawP : NaN;
    if (!Number.isFinite(p)) return null;

    let v: number | undefined;
    if (typeof o.q === "string" && Number.isFinite(Number(o.q))) v = Number(o.q);
    else if (typeof o.v === "number" && Number.isFinite(o.v)) v = o.v;

    return { p, v };
  }

  function parseWsKline(x: unknown): Candle | null {
    if (typeof x !== "object" || x === null) return null;
    const o = x as Record<string, unknown>;
    const k = o.k as Record<string, unknown> | undefined;
    if (!k || typeof k !== "object") return null;
    const t = typeof k.t === "number" ? k.t : Number.NaN;
    const oP = typeof k.o === "string" ? Number(k.o) : Number.NaN;
    const cP = typeof k.c === "string" ? Number(k.c) : Number.NaN;
    const hP = typeof k.h === "string" ? Number(k.h) : Number.NaN;
    const lP = typeof k.l === "string" ? Number(k.l) : Number.NaN;
    const fin = typeof k.x === "boolean" ? k.x : false;
    const v = typeof k.v === "string" ? Number(k.v) : Number.NaN;
    if ([t, oP, cP, hP, lP].some((n) => !Number.isFinite(n))) return null;
    return { t, o: oP, c: cP, h: hP, l: lP, fin, v: Number.isFinite(v) ? v : undefined };
  }
  function aggregateCandles(src: Tick[], sizeMs: number): Candle[] {
    if (!src.length) return [];
    const out: Candle[] = [];
    let curStart = bucketStart(src[0].t, sizeMs);
    let o = src[0].p, h = src[0].p, l = src[0].p, c = src[0].p;
    let v = src[0].v ?? 1;
    for (let i = 1; i < src.length; i++) {
      const s = src[i];
      const b = bucketStart(s.t, sizeMs);
      if (b !== curStart) {
        out.push({ t: curStart, o, h, l, c, fin: true, v });
        curStart = b; o = h = l = c = s.p; v = s.v ?? 1;
      } else {
        h = Math.max(h, s.p);
        l = Math.min(l, s.p);
        c = s.p;
        v += s.v ?? 1; // si no hay volumen real, contamos ticks
      }
    }
    out.push({ t: curStart, o, h, l, c, fin: false, v });
    return out;
  }

  // ---- Carga de datos (WS/SSE + Yahoo semilla con range) ----
  useEffect(() => {
    let alive = true;
    let wsTrade: WebSocket | null = null;
    let wsKline: WebSocket | null = null;
    let es: EventSource | null = null;
    let pollId: number | null = null;

    setTicks([]); setCandles([]); setLast(baseline ?? null);
    setFollow(true); setXEnd(null);

    if (!prov) return () => {};

    const effRange = (histRange === "auto" ? autoRangeFor(tf) : histRange);

    // Yahoo seed (histórico)
    const seed = async () => {
      try {
        const url = `/api/yq?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}&range=${encodeURIComponent(effRange)}`;
        const data = await fetchJSON<{ candles: Candle[] }>(url);
        if (!alive) return;
        setCandles(data.candles);
        if (data.candles.length) {
          setLast(data.candles[data.candles.length - 1].c);
          setXEnd(data.candles[data.candles.length - 1].t);
        }
      } catch {}
    };

    if (prov.kind === "finnhub") {
      void seed();
      es = new EventSource(`/api/rt/stream?symbol=${encodeURIComponent(prov.code)}`);
      es.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data) as { t?: number; p?: number; v?: number; status?: string };
          if (!alive) return;
          if (typeof d.p === "number") {
            const price: number = d.p;
            const ts: number = typeof d.t === "number" ? d.t : Date.now();
            const vol: number | undefined = typeof d.v === "number" ? d.v : undefined;
            setLast(price);
            setTicks((prev) => {
              const next = [...prev, { t: ts, p: price, v: vol }].slice(-50_000);
              if (follow) setXEnd(ts);
              return next;
            });
          }
        } catch {}
      };
    }

    if (prov.kind === "binance") {
      const key = prov.code;
      void seed();

      wsTrade = new WebSocket(`wss://stream.binance.com:9443/ws/${key}@trade`);
      wsTrade.onmessage = (ev) => {
        try {
          const parsed: unknown = JSON.parse(ev.data as string);
          const tdata = parseWsTrade(parsed);
          if (!alive || !tdata) return;
          const t = Date.now();
          setLast(tdata.p);
          setTicks((arr) => {
            const next = [...arr, { t, p: tdata.p, v: tdata.v }].slice(-50_000);
            if (follow) setXEnd(t);
            return next;
          });
        } catch {}
      };

      if (tf !== "1s") {
        const kTf = binanceTf(tf);
        wsKline = new WebSocket(`wss://stream.binance.com:9443/ws/${key}@kline_${kTf}`);
        wsKline.onmessage = (ev) => {
          try {
            const parsed: unknown = JSON.parse(ev.data as string);
            const kl = parseWsKline(parsed);
            if (!alive || !kl) return;
            setCandles((arr) => {
              const next = arr.slice();
              if (next.length && next[next.length - 1].t === kl.t) next[next.length - 1] = kl;
              else next.push(kl);
              setXEnd(kl.t);
              return next.slice(-50_000);
            });
          } catch {}
        };
      }
    }

    if (prov.kind === "yahoo") {
      const load = async () => {
        try {
          const url = `/api/yq?symbol=${encodeURIComponent(prov.code)}&tf=${encodeURIComponent(tf)}&range=${encodeURIComponent(effRange)}`;
          const data = await fetchJSON<{ candles: Candle[] }>(url);
          if (!alive) return;
          setCandles(data.candles);
          if (data.candles.length) {
            setLast(data.candles[data.candles.length - 1].c);
            setXEnd(data.candles[data.candles.length - 1].t);
          }
        } catch {}
      };
      void load();
      pollId = window.setInterval(load, tf === "1m" || tf === "5m" ? 15_000 : 60_000);
    }

    return () => {
      alive = false;
      if (wsTrade) try { wsTrade.close(); } catch {}
      if (wsKline) try { wsKline.close(); } catch {}
      if (es) try { es.close(); } catch {}
      if (pollId) clearInterval(pollId);
    };
  }, [symbol, tf, baseline, prov, follow, histRange]);

  // Series maestras
  const ticksCandles = useMemo(() => aggregateCandles(ticks, tfMs(tf)), [ticks, tf]);

  // Política de velas
  const effCandles = useMemo(() => {
    if (prov?.kind === "binance") {
      if (candles.length) return candles;
      if (ticks.length) return ticksCandles;
      return [];
    }
    if (prov?.kind === "finnhub") {
      if (ticks.length) return ticksCandles;
      if (candles.length) return candles;
      return [];
    }
    return candles; // yahoo
  }, [prov, candles, ticks, ticksCandles]);

  // EMAs
  const ema20 = useMemo(() => ema(effCandles, 20), [effCandles]);
  const ema50 = useMemo(() => ema(effCandles, 50), [effCandles]);
  const ema200 = useMemo(() => ema(effCandles, 200), [effCandles]);

  // Ventana visible (zoom/pan)
  const latestT = useMemo(() => {
    const arr = effCandles.length ? effCandles : ticks.length ? ticks.map(t => ({ t: t.t, c: t.p, o: t.p, h: t.p, l: t.p })) as unknown as Candle[] : [];
    return arr.length ? arr[arr.length - 1].t : Date.now();
  }, [effCandles, ticks]);
  const xMax = xEnd ?? latestT;
  const xMin = xMax - windowMs;

  // Filtrado visible
  const visCandles = useMemo(() => effCandles.filter(k => k.t >= xMin && k.t <= xMax), [effCandles, xMin, xMax]);
  const visEMA20 = useMemo(() => ema20.filter(p => p.t >= xMin && p.t <= xMax), [ema20, xMin, xMax]);
  const visEMA50 = useMemo(() => ema50.filter(p => p.t >= xMin && p.t <= xMax), [ema50, xMin, xMax]);
  const visEMA200 = useMemo(() => ema200.filter(p => p.t >= xMin && p.t <= xMax), [ema200, xMin, xMax]);
  const linePoints: Tick[] = useMemo(() => {
    if (ticks.length) return ticks.filter(pt => pt.t >= xMin && pt.t <= xMax);
    if (visCandles.length) return visCandles.map((k) => ({ t: k.t, p: k.c }));
    return last != null ? [{ t: Date.now(), p: last }] : [];
  }, [ticks, visCandles, last, xMin, xMax]);

  // View / escalas
  const view = useMemo<View>(() => {
    const w = 900;
    const priceH = 220;
    const volH = showVolume ? 60 : 0;
    const h = priceH + volH;
    const EPS = 1e-6;

    const xs = (chartType === "line" ? linePoints.map((d) => d.t) : visCandles.map((k) => k.t));
    const ysRaw = (chartType === "line" ? linePoints.map((d) => d.p) : visCandles.flatMap((k) => [k.h, k.l]));
    const ys = [...ysRaw];


    if (showEMA20 && visEMA20.length) ys.push(...visEMA20.map(p => p.v));
    if (showEMA50 && visEMA50.length) ys.push(...visEMA50.map(p => p.v));
    if (showEMA200 && visEMA200.length) ys.push(...visEMA200.map(p => p.v));

    if (!xs.length || !ys.length) {
      const noop = (x: number) => x;
      return { w, h, priceH, volH, sx: noop, sy: noop, syVol: noop, xMin, xMax, minY: 0, maxY: 1, maxVol: 1, path: "" };
    }

    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);
    if (Number.isFinite(tp ?? NaN)) maxY = Math.max(maxY, tp!);
    if (Number.isFinite(sl ?? NaN)) minY = Math.min(minY, sl!);
    if (Number.isFinite(baseline ?? NaN)) { minY = Math.min(minY, baseline!); maxY = Math.max(maxY, baseline!); }

    const pad = Math.max(1e-6, (maxY - minY) || Math.abs(minY) * 0.05) * 0.1;
    minY -= pad; maxY += pad;

    const spanX = Math.max(EPS, xMax - xMin);
    const spanY = Math.max(EPS, maxY - minY);

    const sx = (x: number) => ((x - xMin) / spanX) * w;

    const linearSy = (y: number) => (priceH - ((y - minY) / spanY) * priceH);
    const logEnabled = logScale && minY > 0 && maxY > 0;
    const logMin = Math.log(minY > 0 ? minY : 1);
    const logSpan = Math.log(maxY) - Math.log(minY > 0 ? minY : 1);
    const logSy = (y: number) =>
      (priceH - ((Math.log(Math.max(y, 1e-12)) - logMin) / Math.max(EPS, logSpan)) * priceH);

    const sy = logEnabled ? logSy : linearSy;

    const vols = visCandles.map(c => c.v ?? 0);
    const maxVol = Math.max(1, ...vols);
    const syVol = (v: number) => (h - (v / maxVol) * volH);

    // path de línea
    let path = "";
    if (chartType === "line" && linePoints.length) {
      for (let i = 0; i < linePoints.length; i++) {
        const X = sx(linePoints[i].t), Y = sy(linePoints[i].p);
        path += i ? ` L ${X} ${Y}` : `M ${X} ${Y}`;
      }
    }

    return { w, h, priceH, volH, sx, sy, syVol, xMin, xMax, minY, maxY, maxVol, path };
  }, [
    chartType, linePoints, visCandles, tp, sl, baseline,
    xMin, xMax, showVolume, logScale,
    visEMA20, visEMA50, visEMA200,
    showEMA20, showEMA50, showEMA200   // <-- añade estas
  ]);

  const numbers = useMemo(() => {
    const lastPrice =
      (chartType === "line" ? linePoints[linePoints.length - 1]?.p : visCandles[visCandles.length - 1]?.c) ?? last ?? null;
    let ref: number | null = null;
    if (chartType === "candles" && visCandles.length) ref = visCandles[visCandles.length - 1].o;
    else if (baseline != null) ref = baseline;
    const chg = lastPrice != null && ref != null ? ((lastPrice - ref) / ref) * 100 : null;

    const highs = chartType === "line" ? linePoints.map((p) => p.p) : visCandles.map((k) => k.h);
    const lows  = chartType === "line" ? linePoints.map((p) => p.p) : visCandles.map((k) => k.l);
    const hi = highs.length ? Math.max(...highs) : null;
    const lo = lows.length ? Math.min(...lows) : null;

    return { lastPrice, chg, hi, lo };
  }, [chartType, linePoints, visCandles, baseline, last]);

  // ---------- Interacción ----------
  function onSvgMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const xSvg = ((e.clientX - rect.left) * view.w) / rect.width;
    setHoverX(xSvg);

    if ((e.buttons & 1) === 1 && dragRef.current) {
      const dxPx = xSvg - dragRef.current.startX;
      const span = view.xMax - view.xMin;
      const dt = (dxPx / view.w) * span;
      const newStart = dragRef.current.startStart - dt;
      const newEnd = dragRef.current.startEnd - dt;
      setFollow(false);

      const globalMin = (effCandles[0]?.t ?? view.xMin) - windowMs * 5;
      const globalMax = (effCandles[effCandles.length - 1]?.t ?? view.xMax) + windowMs * 0.1;
      const spanW = newEnd - newStart;
      const s = Math.max(globalMin, Math.min(newStart, globalMax - spanW));
      setXEnd(s + spanW);
    }

    if (chartType === "line" && linePoints.length) {
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < linePoints.length; i++) {
        const px = view.sx(linePoints[i].t);
        const d = Math.abs(px - xSvg);
        if (d < bestDist) { bestIdx = i; bestDist = d; }
      }
      const pt = linePoints[bestIdx];
      setHover({ kind: "line", t: pt.t, p: pt.p });
      return;
    }

    if (chartType === "candles" && visCandles.length) {
      const bars = Math.max(20, visCandles.length);
      const gap = 2;
      const barW = Math.max(6, (view.w / bars) - gap);

      for (let i = visCandles.length - 1; i >= 0; i--) {
        const cx = view.sx(visCandles[i].t);
        const left = cx - barW / 2;
        if (xSvg >= left && xSvg <= left + barW) {
          setHover({ kind: "candle", c: visCandles[i] });
          return;
        }
      }
      let best = visCandles[0];
      let bestDist = Math.abs(view.sx(best.t) - xSvg);
      for (let i = 1; i < visCandles.length; i++) {
        const d = Math.abs(view.sx(visCandles[i].t) - xSvg);
        if (d < bestDist) { bestDist = d; best = visCandles[i]; }
      }
      setHover({ kind: "candle", c: best });
    }
  }
  function onSvgLeave() { setHover(null); setHoverX(null); }
  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    if (!visCandles.length && !linePoints.length) return;
    const zoomIn = e.deltaY < 0;
    const factor = zoomIn ? 0.9 : 1.1;

    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const xSvg = ((e.clientX - rect.left) * view.w) / rect.width;
    const anchorT = view.xMin + (xSvg / view.w) * (view.xMax - view.xMin);

    const newWin = Math.max(tfMs(tf) * 20, Math.min(windowMs * factor, tfMs("1d") * 60));
    const leftPortion = (anchorT - view.xMin) / (view.xMax - view.xMin);
    const newStart = anchorT - newWin * leftPortion;

    setFollow(false);
    setWindowMs(newWin);
    setXEnd(newStart + newWin);
  }
  function onMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const xSvg = ((e.clientX - rect.left) * view.w) / rect.width;
    dragRef.current = { startX: xSvg, startStart: view.xMin, startEnd: view.xMax };
  }
  function onMouseUp() { dragRef.current = null; }
  function onDblClick() {
    setWindowMs(tfMs(tf) * 180);
    setFollow(true);
    setXEnd(null);
  }

  // Eje Y (grid)
  const yTicks = useMemo(() => {
    const n = 5;
    const res: number[] = [];
    if (view.maxY === view.minY) return res;
    for (let i = 0; i < n; i++) {
      const v = view.minY + ((i / (n - 1)) * (view.maxY - view.minY));
      res.push(v);
    }
    return res;
  }, [view.minY, view.maxY]);

  // Fit a todo el histórico cargado
  function fitAll() {
    const first = effCandles[0]?.t;
    const lastT = effCandles[effCandles.length - 1]?.t || Date.now();
    if (first) {
      const span = Math.max(60_000, lastT - first);
      setWindowMs(span * 1.05);
      setXEnd(lastT);
      setFollow(false);
    }
  }

  // ---------- Render ----------
  return (
    <div className="card p-4 overflow-hidden">
      {/* Topbar de controles */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="toolbar">
          <span className="text-xs opacity-80 mr-2">Periodo</span>
          {(["1s","1m","5m","15m","1h","4h","1d"] as Timeframe[]).map((t) => (
            <button key={t} className={`text-xs px-2 py-1 rounded ${tf === t ? "btn-primary" : "hover:bg-white/10"}`}
              onClick={() => { setTf(t); setWindowMs(tfMs(t) * 180); }}>
              {t}
            </button>
          ))}
        </div>

        <div className="toolbar">
          <span className="text-xs opacity-80 mr-2">Tipo</span>
          <button className={`text-xs px-2 py-1 rounded ${chartType === "line" ? "btn-primary" : "hover:bg-white/10"}`} onClick={() => setChartType("line")}>Línea</button>
          <button className={`text-xs px-2 py-1 rounded ${chartType === "candles" ? "btn-primary" : "hover:bg-white/10"}`} onClick={() => setChartType("candles")}>Velas</button>
        </div>

        <div className="toolbar">
          <span className="text-xs opacity-80 mr-2">Histórico</span>
          <select
            value={histRange}
            onChange={(e) => setHistRange(e.target.value as HistoryRange)}
            className="text-xs bg-transparent border border-white/15 rounded px-2 py-1"
            title="Rango de histórico"
          >
            <option value="auto">Auto</option>
            <option value="1d">1d</option>
            <option value="5d">5d</option>
            <option value="1mo">1mo</option>
            <option value="3mo">3mo</option>
            <option value="6mo">6mo</option>
            <option value="1y">1y</option>
          </select>
          <button className="text-xs px-2 py-1 rounded hover:bg-white/10 ml-2" onClick={fitAll}>Ajustar a todo</button>
          {!follow && (
            <button className="text-xs px-2 py-1 rounded hover:bg-white/10 ml-2" onClick={() => { setFollow(true); setXEnd(null); }}>
              Seguir en vivo
            </button>
          )}
        </div>

        <div className="toolbar">
          <label className="text-xs mr-2">EMAs</label>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={showEMA20} onChange={(e) => setShowEMA20(e.target.checked)} /> 20
          </label>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={showEMA50} onChange={(e) => setShowEMA50(e.target.checked)} /> 50
          </label>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={showEMA200} onChange={(e) => setShowEMA200(e.target.checked)} /> 200
          </label>
          <span className="mx-2">|</span>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={showVolume} onChange={(e) => setShowVolume(e.target.checked)} /> Volumen
          </label>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} /> Log
          </label>
        </div>

        <div className="text-right text-sm opacity-80">
          {numbers.lastPrice != null && <div>Último: <span className="font-semibold">{numbers.lastPrice.toFixed(4)}</span></div>}
          {numbers.chg != null && (
            <div> Cambio:{" "}
              <span className={numbers.chg >= 0 ? "text-[--success]" : "text-[--danger]"}>{numbers.chg >= 0 ? "▲" : "▼"} {numbers.chg.toFixed(2)}%</span>
            </div>
          )}
          {(numbers.hi != null && numbers.lo != null) && <div>Rango: {numbers.lo.toFixed(4)} – {numbers.hi.toFixed(4)}</div>}
        </div>
      </div>

      {/* SVG principal (precio + volumen) */}
      <svg
        viewBox={`0 0 ${view.w} ${view.h}`}
        className="w-full"
        onMouseMove={onSvgMove}
        onMouseLeave={onSvgLeave}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onDoubleClick={onDblClick}
      >
        {/* GRID Y (solo en zona de precio) */}
        {yTicks.map((v, i) => {
          const y = view.sy(v);
          return (
            <g key={`grid-${i}`}>
              <line x1={0} x2={view.w} y1={y} y2={y} stroke="currentColor" opacity={0.07} />
              <text x={view.w - 4} y={y - 2} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.6}>
                {v.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* ----- PRECIO ----- */}
        {/* Línea */}
        {chartType === "line" && (
          <>
            <path d={view.path} fill="none" stroke="url(#auraGrad)" strokeWidth={2} />
            {linePoints.length === 1 && (
              <circle cx={view.sx(linePoints[0].t)} cy={view.sy(linePoints[0].p)} r={3} fill="var(--primary)" />
            )}
            <defs>
              <linearGradient id="auraGrad" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="var(--accent)" />
                <stop offset="1" stopColor="var(--primary)" />
              </linearGradient>
            </defs>
          </>
        )}

        {/* Velas */}
        {chartType === "candles" && (() => {
          const data = visCandles;
          if (!data.length) return null;
          const bars = Math.max(20, data.length);
          const gap = 2;
          const barW = Math.max(6, (view.w / bars) - gap);
          return (
            <>
              {data.map((k, i) => {
                const x = view.sx(k.t);
                const openY = view.sy(k.o);
                const closeY = view.sy(k.c);
                const highY = view.sy(k.h);
                const lowY  = view.sy(k.l);
                const up = k.c >= k.o;
                const left = x - barW / 2;
                return (
                  <g key={`${k.t}:${i}`}>
                    <line x1={x} x2={x} y1={highY} y2={lowY} stroke={up ? "var(--success)" : "var(--danger)"} strokeWidth={1}/>
                    <rect x={left} y={Math.min(openY, closeY)} width={barW} height={Math.max(2, Math.abs(closeY - openY))} fill={up ? "var(--success)" : "var(--danger)"} opacity={0.9} rx={1}/>
                  </g>
                );
              })}
            </>
          );
        })()}

        {/* EMAs */}
        {showEMA20 && visEMA20.length > 1 && (
          <path d={`M ${visEMA20.map(p => `${view.sx(p.t)} ${view.sy(p.v)}`).join(" L ")}`} fill="none" stroke="var(--primary)" strokeOpacity={0.9} strokeWidth={1.6} />
        )}
        {showEMA50 && visEMA50.length > 1 && (
          <path d={`M ${visEMA50.map(p => `${view.sx(p.t)} ${view.sy(p.v)}`).join(" L ")}`} fill="none" stroke="var(--accent)" strokeOpacity={0.8} strokeWidth={1.3} />
        )}
        {showEMA200 && visEMA200.length > 1 && (
          <path d={`M ${visEMA200.map(p => `${view.sx(p.t)} ${view.sy(p.v)}`).join(" L ")}`} fill="none" stroke="currentColor" strokeOpacity={0.5} strokeWidth={1.1} />
        )}

        {/* Guías */}
        {Number.isFinite(baseline ?? NaN) && (
          <line x1={0} x2={view.w} y1={view.sy(baseline!)} y2={view.sy(baseline!)} stroke="currentColor" opacity={0.25} strokeDasharray="4 4" />
        )}
        {Number.isFinite(tp ?? NaN) && (
          <line x1={0} x2={view.w} y1={view.sy(tp!)} y2={view.sy(tp!)} stroke="var(--success)" opacity={0.85} strokeDasharray="6 4" />
        )}
        {Number.isFinite(sl ?? NaN) && (
          <line x1={0} x2={view.w} y1={view.sy(sl!)} y2={view.sy(sl!)} stroke="var(--danger)" opacity={0.85} strokeDasharray="6 4" />
        )}

        {/* CROSSHAIR + REGLA PRECIO */}
        {hover && hoverX != null && (
          <>
            {/* Vertical en todo el alto (precio + volumen) */}
            <line x1={hoverX} x2={hoverX} y1={0} y2={view.h} stroke="currentColor" opacity={0.25} />
            {/* Horizontal en precio */}
            <line
              x1={0} x2={view.w}
              y1={hover.kind === "line" ? view.sy(hover.p) : view.sy(hover.c.c)}
              y2={hover.kind === "line" ? view.sy(hover.p) : view.sy(hover.c.c)}
              stroke="currentColor" opacity={0.25}
            />
            {/* Etiqueta de precio */}
            <g>
              <rect
                x={view.w - 78}
                y={(hover.kind === "line" ? view.sy(hover.p) : view.sy(hover.c.c)) - 10}
                width={76} height={18} rx={4}
                fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.15)"
              />
              <text x={view.w - 40} y={(hover.kind === "line" ? view.sy(hover.p) : view.sy(hover.c.c)) + 3} textAnchor="middle" fontSize="11" fill="currentColor">
                {(hover.kind === "line" ? hover.p : hover.c.c).toFixed(4)}
              </text>
            </g>

            {/* Tooltip */}
            {hover.kind === "line" ? (
              <>
                <circle cx={view.sx(hover.t)} cy={view.sy(hover.p)} r={3} fill="var(--primary)" />
                <rect x={Math.min(view.w - 160, Math.max(8, view.sx(hover.t) + 8))} y={8} width={150} height={40} rx={6} fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.15)"/>
                <text x={Math.min(view.w - 152, Math.max(16, view.sx(hover.t) + 16))} y={24} fontSize="12" fill="currentColor">{fmtTime(hover.t)}</text>
                <text x={Math.min(view.w - 152, Math.max(16, view.sx(hover.t) + 16))} y={40} fontSize="12" fill="currentColor">Precio: {hover.p.toFixed(4)}</text>
              </>
            ) : (
              <>
                <rect x={Math.min(view.w - 190, Math.max(8, view.sx(hover.c.t) + 8))} y={8} width={180} height={56} rx={6} fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.15)"/>
                <text x={Math.min(view.w - 182, Math.max(16, view.sx(hover.c.t) + 16))} y={22} fontSize="12" fill="currentColor">{fmtTime(hover.c.t)}</text>
                <text x={Math.min(view.w - 182, Math.max(16, view.sx(hover.c.t) + 16))} y={36} fontSize="12" fill="currentColor">O:{hover.c.o.toFixed(4)}  H:{hover.c.h.toFixed(4)}</text>
                <text x={Math.min(view.w - 182, Math.max(16, view.sx(hover.c.t) + 16))} y={50} fontSize="12" fill="currentColor">L:{hover.c.l.toFixed(4)}  C:{hover.c.c.toFixed(4)}</text>
              </>
            )}
          </>
        )}

        {/* Etiqueta último precio */}
        {numbers.lastPrice != null && (
          <g>
            <rect x={view.w - 78} y={view.sy(numbers.lastPrice) - 10} width={76} height={18} rx={4} fill="rgba(0,0,0,0.75)" stroke="rgba(255,255,255,0.2)"/>
            <text x={view.w - 40} y={view.sy(numbers.lastPrice) + 3} textAnchor="middle" fontSize="11" fill="currentColor">
              {numbers.lastPrice.toFixed(4)}
            </text>
          </g>
        )}

        {/* ----- VOLUMEN ----- */}
        {showVolume && view.volH > 0 && (() => {
          const data = visCandles;
          if (!data.length) return null;
          const bars = Math.max(20, data.length);
          const gap = 2;
          const barW = Math.max(4, (view.w / bars) - gap);
          return (
            <>
              {data.map((k, i) => {
                const x = view.sx(k.t);
                const left = x - barW / 2;
                const top = view.syVol(k.v ?? 0);
                const up = k.c >= k.o;
                return (
                  <rect key={`vol-${k.t}:${i}`} x={left} y={top} width={barW} height={view.h - top} fill={up ? "var(--success)" : "var(--danger)"} opacity={0.4} />
                );
              })}
            </>
          );
        })()}
      </svg>

      <div className="flex flex-wrap items-center gap-3 text-sm mt-2">
        <span className="chip">Precio en vivo</span>
        {Number.isFinite(baseline ?? NaN) && <span className="chip">Referencia del modelo</span>}
        {Number.isFinite(tp ?? NaN) && <span className="chip chip--green">Meta de ganancia</span>}
        {Number.isFinite(sl ?? NaN) && <span className="chip chip--red">Piso de protección</span>}
      </div>
    </div>
  );
}

// ================== HOME ==================
export default function HomePage() {
  const router = useRouter();

  const defaults = useMemo(() => {
    const p = loadRiskProfile()?.profile;
    if (p === "Conservador") return { horizon: "1d" as Horizon, minConf: 0.65 };
    if (p === "Agresivo")   return { horizon: "1w" as Horizon, minConf: 0.55 };
    return { horizon: "1d" as Horizon, minConf: 0.60 };
  }, []);

  const [horizon, setHorizon] = useState<Horizon>(defaults.horizon);
  const [minConf, setMinConf] = useState<number>(defaults.minConf);
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setError(null);
        const data = await getFeed(horizon, minConf);
        if (!alive) return;
        setFeed(data);
        setUpdatedAt(new Date());
        if (!focus) {
          const best = data
            .filter((d) => d.action !== "ABSTAIN")
            .sort((a, b) => (b.p_conf ?? 0) - (a.p_conf ?? 0))[0];
          if (best) {
            setFocus(best.symbol);
            setPinned((p) => (p.includes(best.symbol) ? p : [best.symbol, ...p].slice(0, 6)));
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cargar el feed");
      }
    }
    load();
    const id = setInterval(load, 90_000);
    return () => { alive = false; clearInterval(id); };
  }, [horizon, minConf, focus]);

  const current = useMemo(() => {
    if (!feed || !focus) return null;
    return feed.find((x) => x.symbol === focus) ?? null;
  }, [feed, focus]);

  const confPct = current?.p_conf != null ? Math.round(current.p_conf * 100) : null;

  function togglePin(sym: string) {
    setPinned((p) => (p.includes(sym) ? p.filter((s) => s !== sym) : [sym, ...p].slice(0, 6)));
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <header className="flex flex-wrap items-center gap-4 justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Para ti</h1>
            <p className="text-sm opacity-70">Recomendaciones sencillas según tu perfil.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={horizon} onChange={(e) => setHorizon(e.target.value as Horizon)} className="toolbar" title="Periodo">
              <option value="1d">Próximos días</option>
              <option value="1w">Próximas semanas</option>
            </select>
            <div className="toolbar">
              <label className="text-xs opacity-80 mr-2">Certeza mínima</label>
              <input type="range" min={55} max={80} value={Math.round(minConf * 100)} onChange={(e) => setMinConf(Number(e.target.value) / 100)} />
              <span className="ml-2 text-xs font-medium">{Math.round(minConf * 100)}%</span>
            </div>
            <button className="btn" onClick={() => router.push("/feed")}>Ver todo</button>
          </div>
        </header>

        <section className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-semibold">{current?.symbol ?? "—"}</div>
                  {current && <span className="chip">{actionLabel(current.action)}</span>}
                  {confPct != null && <span className="chip">{confPct}% certeza</span>}
                  {current?.horizon && <span className="chip">{horizonLabel((current.horizon as Horizon) || "1d")}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {current && (
                    <button className={`btn ${pinned.includes(current.symbol) ? "btn-primary" : ""}`} onClick={() => togglePin(current.symbol)}>
                      {pinned.includes(current.symbol) ? "Fijado" : "Fijar"}
                    </button>
                  )}
                </div>
              </div>

              <RealTimeChart
                symbol={current?.symbol ?? ""}
                baseline={current?.last_close ?? null}
                tp={current?.stops?.tp ?? null}
                sl={current?.stops?.sl ?? null}
              />
            </div>
          </div>

          <aside className="space-y-3">
            <div className="card p-4">
              <div className="text-sm opacity-80 mb-2">Acciones rápidas</div>
              <div className="flex flex-wrap gap-2">
                <button className="btn" onClick={() => router.push("/simulator")}>Probar inversión</button>
                <button className="btn" onClick={() => router.push("/invest/request")}>Enviar solicitud</button>
                <button className="btn" onClick={() => router.push("/profile")}>Mi perfil</button>
              </div>
            </div>

            <div className="card p-4">
              <div className="text-sm opacity-80 mb-2">Actualización</div>
              <div className="text-xs opacity-70">
                {updatedAt ? `Último refresco: ${updatedAt.toLocaleTimeString()}` : "Cargando…"}
              </div>
            </div>
          </aside>
        </section>

        <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {error && (
            <div className="sm:col-span-2 lg:col-span-3 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200">
              {error}
            </div>
          )}
          {!feed && !error && (
            <>
              <div className="card p-4 h-28 animate-pulse" />
              <div className="card p-4 h-28 animate-pulse" />
              <div className="card p-4 h-28 animate-pulse" />
            </>
          )}
          {feed && feed
            .filter((it) => it.symbol !== current?.symbol)
            .map((it) => {
              const conf = it.p_conf != null ? Math.round(it.p_conf * 100) : 0;
              const pinnedNow = pinned.includes(it.symbol);
              return (
                <button
                  key={it.symbol}
                  className={`card p-4 text-left transition ${current?.symbol === it.symbol ? "ring-2 ring-[--ring]" : "hover:bg-white/10"}`}
                  onClick={() => { setFocus(it.symbol); if (!pinnedNow) setPinned((p) => [it.symbol, ...p].slice(0, 6)); }}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{it.symbol}</div>
                    <span className="chip">{actionLabel(it.action)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm opacity-80">
                    <span>{horizonLabel((it.horizon as Horizon) || "1d")}</span>
                    <span>•</span>
                    <span>{conf}% certeza</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${pinnedNow ? "bg-[--primary] text-white border-transparent" : "bg-white/10 border-white/15"}`}
                      onClick={(e) => { e.stopPropagation(); togglePin(it.symbol); }}
                    >
                      {pinnedNow ? "Fijado" : "Fijar"}
                    </span>
                    {it.stops?.tp != null && it.stops?.sl != null && <span className="text-xs opacity-70">con protecciones</span>}
                  </div>
                </button>
              );
            })}
        </section>
      </div>
    </main>
  );
}
