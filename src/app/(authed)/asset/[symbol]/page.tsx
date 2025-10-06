"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { notFound } from "next/navigation";

/* =========================================================
   Tipos y utilidades
========================================================= */

type Timeframe = "1s" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
type HistoryRange = "auto" | "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y";
type ChartType = "candles" | "line";

type Candle = { t: number; o: number; h: number; l: number; c: number; fin?: boolean; v?: number };
type Tick   = { t: number; p: number; v?: number };

type Provider = { kind: "binance" | "finnhub" | "yahoo"; code: string };

type PositionSide = "LONG" | "SHORT";
type Position = {
  id: string;
  symbol: string;
  side: PositionSide;
  qty: number;          // unidades del activo
  leverage?: number;    // opcional
  entry: number;        // precio de entrada
  openedAt: number;
};

/* ===== Resolve proveedor ===== */

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
function resolveProvider(symbol: string): Provider | null {
  const b = binanceCodeFromSymbol(symbol);
  if (b) return { kind: "binance", code: b };
  const f = finnhubCodeFromSymbol(symbol);
  if (f) return { kind: "finnhub", code: f };
  if (symbol) return { kind: "yahoo", code: symbol };
  return null;
}

/* ===== helpers de tiempo y rango ===== */

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
function bucketStart(t: number, sizeMs: number): number { return Math.floor(t / sizeMs) * sizeMs; }
function fmtTime(t: number) {
  const d = new Date(t);
  return d.toLocaleString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* ===== store en localStorage ===== */

const LS_KEY = "aura_positions_v1";
function loadPositions(symbol: string): Position[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as Position[];
    return all.filter(p => p.symbol === symbol);
  } catch { return []; }
}
function savePositions(all: Position[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}
function loadAllPositions(): Position[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Position[]) : [];
  } catch { return []; }
}

/* ===== PnL ===== */

function computePnL(pos: Position, mark: number) {
  const sideSign = pos.side === "LONG" ? 1 : -1;
  const diff = (mark - pos.entry) * sideSign;  // por unidad
  const pnl  = diff * pos.qty;                 // monetario
  const notional = pos.entry * pos.qty;
  const margin = pos.leverage && pos.leverage > 0 ? notional / pos.leverage : notional;
  const roiPct = margin > 0 ? (pnl / margin) * 100 : 0;
  return { pnl, roiPct, notional, margin };
}

/* =========================================================
   Chart en vivo (compacto)
========================================================= */

type Hover =
  | { kind: "line"; t: number; p: number }
  | { kind: "candle"; c: Candle }
  | null;

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
      v += s.v ?? 1;
    }
  }
  out.push({ t: curStart, o, h, l, c, fin: false, v });
  return out;
}

function parseWsTrade(x: unknown): { p: number; v?: number } | null {
  if (typeof x !== "object" || x === null) return null;

  type TradeShape = {
    p?: number | string;
    price?: number | string;
    q?: number | string;
    v?: number;
  };
  const o = x as TradeShape;

  const rawP = o.p ?? o.price;
  const p = typeof rawP === "string" ? Number(rawP) : typeof rawP === "number" ? rawP : NaN;
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
  const t  = typeof k.t === "number" ? k.t : Number.NaN;
  const oo = typeof k.o === "string" ? Number(k.o) : Number.NaN;
  const cc = typeof k.c === "string" ? Number(k.c) : Number.NaN;
  const hh = typeof k.h === "string" ? Number(k.h) : Number.NaN;
  const ll = typeof k.l === "string" ? Number(k.l) : Number.NaN;
  const fin = typeof k.x === "boolean" ? k.x : false;
  const vv  = typeof k.v === "string" ? Number(k.v) : Number.NaN;
  if ([t, oo, cc, hh, ll].some((n) => !Number.isFinite(n))) return null;
  return { t, o: oo, c: cc, h: hh, l: ll, fin, v: Number.isFinite(vv) ? vv : undefined };
}

function AssetChart({
  symbol,
  onPrice,
}: {
  symbol: string;
  onPrice?: (p: number) => void;
}) {
  const [tf, setTf] = useState<Timeframe>("1m");
  const [range, setRange] = useState<HistoryRange>("auto");
  const [type, setType] = useState<ChartType>("candles");

  const [ticks, setTicks] = useState<Tick[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [last, setLast] = useState<number | null>(null);

  const [follow, setFollow] = useState(true);
  const [windowMs, setWindowMs] = useState(tfMs("1m") * 180);
  const [xEnd, setXEnd] = useState<number | null>(null);

  const [hover, setHover] = useState<Hover>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const dragRef = useRef<{ startX: number; startStart: number; startEnd: number } | null>(null);

  const prov = useMemo(() => resolveProvider(symbol), [symbol]);

  // seed histórico desde Yahoo + RT por proveedor
  useEffect(() => {
    let alive = true;
    let wsTrade: WebSocket | null = null;
    let wsKline: WebSocket | null = null;
    let es: EventSource | null = null;
    let pollId: number | null = null;

    setTicks([]); setCandles([]); setLast(null);
    setFollow(true); setXEnd(null);
    if (!prov) return () => {};

    const effRange = (range === "auto" ? autoRangeFor(tf) : range);

    const seed = async () => {
      try {
        const url = `/api/yq?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}&range=${encodeURIComponent(effRange)}`;
        const data = await fetch(url, { cache: "no-store" }).then(r => r.json()) as { candles: Candle[] };
        if (!alive) return;
        setCandles(data.candles);
        const lastC = data.candles[data.candles.length - 1];
        if (lastC) { setLast(lastC.c); setXEnd(lastC.t); onPrice?.(lastC.c); }
      } catch {}
    };

    if (prov.kind === "finnhub") {
      void seed();
      es = new EventSource(`/api/rt/stream?symbol=${encodeURIComponent(prov.code)}`);
      es.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data) as { t?: number; p?: number; v?: number };
          if (!alive || typeof d.p !== "number") return;
          const ts = typeof d.t === "number" ? d.t : Date.now();
          setLast(d.p);
          onPrice?.(d.p);

          setTicks((prev) => {
            const tick: Tick = { t: ts, p: d.p as number, v: d.v };
            const next = [...prev, tick].slice(-50_000);
            if (follow) setXEnd(ts);
            return next;
          });

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
          setLast(tdata.p); onPrice?.(tdata.p);
          setTicks((prev) => {
            const tick: Tick = { t, p: tdata.p, v: tdata.v };
            const next = [...prev, tick].slice(-50_000);
            if (follow) setXEnd(t);
            return next;
          });

        } catch {}
      };

      if (tf !== "1s") {
          const kTf: Exclude<Timeframe, "1s"> = tf;
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
          const data = await fetch(url, { cache: "no-store" }).then(r => r.json()) as { candles: Candle[] };
          if (!alive) return;
          setCandles(data.candles);
          const lastC = data.candles[data.candles.length - 1];
          if (lastC) { setLast(lastC.c); setXEnd(lastC.t); onPrice?.(lastC.c); }
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
  }, [symbol, tf, range, prov, follow, onPrice]);

  // serie efectiva
  const ticksCandles = useMemo(() => aggregateCandles(ticks, tfMs(tf)), [ticks, tf]);
  const effCandles = useMemo(() => {
    if (prov?.kind === "binance") return candles.length ? candles : ticksCandles;
    if (prov?.kind === "finnhub") return ticks.length ? ticksCandles : candles;
    return candles;
  }, [prov, candles, ticks, ticksCandles]);

  // ventana visible
  const latestT = useMemo(() => effCandles.at(-1)?.t ?? Date.now(), [effCandles]);
  const xMax = xEnd ?? latestT;
  const xMin = xMax - windowMs;

  const visCandles = useMemo(() => effCandles.filter(k => k.t >= xMin && k.t <= xMax), [effCandles, xMin, xMax]);
  const linePoints: Tick[] = useMemo(() => {
    if (ticks.length) return ticks.filter(pt => pt.t >= xMin && pt.t <= xMax);
    if (visCandles.length) return visCandles.map(k => ({ t: k.t, p: k.c }));
    return last != null ? [{ t: Date.now(), p: last }] : [];
  }, [ticks, visCandles, last, xMin, xMax]);

  // view
  const view = useMemo(() => {
    const w = 900, h = 260, EPS = 1e-6;
    const xs = (type === "line" ? linePoints.map(d => d.t) : visCandles.map(k => k.t));
    const ysRaw = (type === "line" ? linePoints.map(d => d.p) : visCandles.flatMap(k => [k.h, k.l]));
    const ys = [...ysRaw];
    if (!xs.length || !ys.length) {
      const noop = (x: number) => x;
      return { w, h, sx: noop, sy: noop, xMin, xMax, minY: 0, maxY: 1, path: "" };
    }
    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);
    const pad = Math.max(1e-6, (maxY - minY) || Math.abs(minY) * 0.05) * 0.1;
    minY -= pad; maxY += pad;

    const spanX = Math.max(EPS, xMax - xMin);
    const spanY = Math.max(EPS, maxY - minY);
    const sx = (x: number) => ((x - xMin) / spanX) * w;
    const sy = (y: number) => (h - ((y - minY) / spanY) * h);

    let path = "";
    if (type === "line" && linePoints.length) {
      for (let i = 0; i < linePoints.length; i++) {
        const X = sx(linePoints[i].t), Y = sy(linePoints[i].p);
        path += i ? ` L ${X} ${Y}` : `M ${X} ${Y}`;
      }
    }
    return { w, h, sx, sy, xMin, xMax, minY, maxY, path };
  }, [type, linePoints, visCandles, xMin, xMax]);

  // interacción
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
      const spanW = newEnd - newStart;
      setXEnd(newStart + spanW);
    }

    if (type === "line" && linePoints.length) {
      let bestIdx = 0, best = Infinity;
      for (let i = 0; i < linePoints.length; i++) {
        const px = view.sx(linePoints[i].t);
        const d = Math.abs(px - xSvg);
        if (d < best) { best = d; bestIdx = i; }
      }
      const pt = linePoints[bestIdx];
      setHover({ kind: "line", t: pt.t, p: pt.p });
      return;
    }
    if (type === "candles" && visCandles.length) {
      let best = visCandles[0], bestD = Math.abs(view.sx(best.t) - xSvg);
      for (let i = 1; i < visCandles.length; i++) {
        const d = Math.abs(view.sx(visCandles[i].t) - xSvg);
        if (d < bestD) { bestD = d; best = visCandles[i]; }
      }
      setHover({ kind: "candle", c: best });
    }
  }
  function onSvgLeave() { setHover(null); setHoverX(null); }

  const lastShown = (type === "line" ? linePoints.at(-1)?.p : visCandles.at(-1)?.c) ?? last ?? null;

  return (
    <div className="card p-4">
      {/* Controles */}
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
          <button className={`text-xs px-2 py-1 rounded ${type === "line" ? "btn-primary" : "hover:bg-white/10"}`} onClick={() => setType("line")}>Línea</button>
          <button className={`text-xs px-2 py-1 rounded ${type === "candles" ? "btn-primary" : "hover:bg-white/10"}`} onClick={() => setType("candles")}>Velas</button>
        </div>
        <div className="toolbar">
          <span className="text-xs opacity-80 mr-2">Histórico</span>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as HistoryRange)}
            className="text-xs bg-transparent border border-white/15 rounded px-2 py-1"
          >
            <option value="auto">Auto</option>
            <option value="1d">1d</option>
            <option value="5d">5d</option>
            <option value="1mo">1mo</option>
            <option value="3mo">3mo</option>
            <option value="6mo">6mo</option>
            <option value="1y">1y</option>
          </select>
        </div>
        <div className="text-sm opacity-80">
          {lastShown != null && <>Último: <span className="font-semibold">{lastShown.toFixed(4)}</span></>}
        </div>
      </div>

      {/* SVG */}
      <svg
        viewBox={`0 0 ${900} ${260}`}
        className="w-full"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseMove={onSvgMove}
        onMouseLeave={onSvgLeave}
      >
        {/* Grid Y */}
        {[0,1,2,3,4].map((i) => {
          if (view.maxY === view.minY) return null;
          const v = view.minY + (i / 4) * (view.maxY - view.minY);
          const y = view.sy(v);
          return (
            <g key={i}>
              <line x1={0} x2={view.w} y1={y} y2={y} stroke="currentColor" opacity={0.07} />
              <text x={view.w - 4} y={y - 2} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.6}>
                {v.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Linea */}
        {type === "line" && (
          <path d={view.path} fill="none" stroke="var(--primary)" strokeWidth={2} />
        )}

        {/* Velas */}
        {type === "candles" && (() => {
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

        {/* Crosshair */}
        {hover && hoverX != null && (
          <>
            <line x1={hoverX} x2={hoverX} y1={0} y2={260} stroke="currentColor" opacity={0.25} />
            <line
              x1={0} x2={900}
              y1={hover.kind === "line" ? view.sy(hover.p) : view.sy(hover.c.c)}
              y2={hover.kind === "line" ? view.sy(hover.p) : view.sy(hover.c.c)}
              stroke="currentColor" opacity={0.25}
            />
            <rect
              x={900 - 78}
              y={(hover.kind === "line" ? view.sy(hover.p) : view.sy(hover.c.c)) - 10}
              width={76} height={18} rx={4}
              fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.15)"
            />
            <text x={900 - 40} y={(hover.kind === "line" ? view.sy(hover.p) : view.sy(hover.c.c)) + 3} textAnchor="middle" fontSize="11" fill="currentColor">
              {(hover.kind === "line" ? hover.p : hover.c.c).toFixed(4)}
            </text>

            {hover.kind === "candle" && (
              <>
                <rect x={Math.min(900 - 190, Math.max(8, view.sx(hover.c.t) + 8))} y={8} width={180} height={56} rx={6} fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.15)"/>
                <text x={Math.min(900 - 182, Math.max(16, view.sx(hover.c.t) + 16))} y={22} fontSize="12" fill="currentColor">{fmtTime(hover.c.t)}</text>
                <text x={Math.min(900 - 182, Math.max(16, view.sx(hover.c.t) + 16))} y={36} fontSize="12" fill="currentColor">O:{hover.c.o.toFixed(4)}  H:{hover.c.h.toFixed(4)}</text>
                <text x={Math.min(900 - 182, Math.max(16, view.sx(hover.c.t) + 16))} y={50} fontSize="12" fill="currentColor">L:{hover.c.l.toFixed(4)}  C:{hover.c.c.toFixed(4)}</text>
              </>
            )}
          </>
        )}
      </svg>

      {/* Pie */}
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <span className="chip">Zoom con rueda · Pan con arrastre</span>
        {!follow && <button className="text-xs px-2 py-1 rounded hover:bg-white/10" onClick={() => { setFollow(true); setXEnd(null); }}>Seguir en vivo</button>}
      </div>
    </div>
  );
}

/* =========================================================
   Ticket, posiciones y simulador
========================================================= */

function uuid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

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

  const positions = useMemo(() => loadPositions(symbol), [symbol]);
  const [list, setList] = useState<Position[]>(positions);

  useEffect(() => setList(loadPositions(symbol)), [symbol]);

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
    const my = all.filter(p => p.symbol === symbol);
    setList(my);
    onPositionsChange?.(my);
  }

  function close(id: string) {
    const all = loadAllPositions().filter(p => p.id !== id);
    savePositions(all);
    const my = all.filter(p => p.symbol === symbol);
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
          <input type="number" className="w-full mt-1 input" min={0} step="0.0001" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </label>
        <label className="text-sm">
          Apalancamiento
          <input type="number" className="w-full mt-1 input" min={1} step="1" value={lev} onChange={(e) => setLev(Math.max(1, Number(e.target.value)))} />
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
                    <div className="font-medium">{p.side} {p.qty} @ {p.entry.toFixed(4)} {p.leverage ? `· x${p.leverage}` : ""}</div>
                    <div className="text-xs opacity-70">Margin: {margin.toFixed(2)}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm ${pnl >= 0 ? "text-[--success]" : "text-[--danger]"}`}>{pnl >= 0 ? "▲" : "▼"} {pnl.toFixed(2)}</div>
                    <div className="text-xs opacity-70">{roiPct.toFixed(2)}%</div>
                  </div>
                  <button className="text-xs px-2 py-1 rounded hover:bg-white/10 ml-2" onClick={() => close(p.id)}>Cerrar</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Simulador */}
      <div className="pt-2 border-t border-white/10">
        <div className="text-sm opacity-80 mb-2">Simulador</div>
        <SimPanel symbol={symbol} positions={list} mark={mark} />
      </div>
    </div>
  );
}

function SimPanel({ symbol, positions, mark }: { symbol: string; positions: Position[]; mark: number }) {
  const [exit, setExit] = useState<number>(mark);
  useEffect(() => { setExit(mark); }, [mark]);

  const agg = useMemo(() => {
    let pnl = 0, margin = 0;
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
        <input type="number" className="w-full mt-1 input" step="0.0001" value={Number.isFinite(exit) ? exit : 0} onChange={(e) => setExit(Number(e.target.value))} />
      </label>
      <div className="text-sm">
        PnL total ({symbol}):{" "}
        <span className={agg.pnl >= 0 ? "text-[--success]" : "text-[--danger]"}>{agg.pnl >= 0 ? "▲" : "▼"} {agg.pnl.toFixed(2)}</span>{" "}
        <span className="opacity-70">({agg.roi.toFixed(2)}%)</span>
      </div>
    </div>
  );
}

/* =========================================================
   Página
========================================================= */

export default function AssetPage({ params }: { params: { symbol?: string } }) {
  const symbol = (params.symbol || "").toUpperCase();
  if (!symbol) notFound();

  const [last, setLast] = useState<number | null>(null);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{symbol}</h1>
          <div className="text-sm opacity-80">
            {last != null ? <>Último: <span className="font-semibold">{last.toFixed(4)}</span></> : "Cargando…"}
          </div>
        </header>

        <section className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <AssetChart symbol={symbol} onPrice={setLast} />
          </div>
          <div>
            <TradePanel symbol={symbol} lastPrice={last} />
          </div>
        </section>
      </div>
    </main>
  );
}
