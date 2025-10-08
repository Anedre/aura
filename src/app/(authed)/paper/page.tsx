// src/app/(authed)/paper/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import MarketChartE from "@/components/MarketChartE";
/* ============================
   Tipos y constantes (modo demo)
============================ */

type Side = "LONG" | "SHORT";
type DemoTrade = {
  id: string;
  symbol: string;
  side: Side;
  qty: number;       // cantidad del activo
  entry: number;     // precio de entrada
  openedAt: number;
  exit?: number;     // precio de salida (si cerrada)
  closedAt?: number;
};
type DemoSession = {
  createdAt: number;
  baseCash: number;  // saldo base (virtual)
};

const START_CASH = 100;
const LS_SESSION = "paper_session_v1";
const LS_TRADES = "paper_trades_v1";

/* ============================
   Helpers utilitarios
============================ */

function fmtTime(t: number) {
  const d = new Date(t);
  return d.toLocaleString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function uuid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }

/* ============================
   LocalStorage helpers
============================ */

function loadSession(): DemoSession {
  try {
    const raw = localStorage.getItem(LS_SESSION);
    if (raw) return JSON.parse(raw) as DemoSession;
  } catch {
    /* ignore */
  }
  const fresh: DemoSession = { createdAt: Date.now(), baseCash: START_CASH };
  localStorage.setItem(LS_SESSION, JSON.stringify(fresh));
  return fresh;
}
function saveSession(s: DemoSession) {
  localStorage.setItem(LS_SESSION, JSON.stringify(s));
}

function loadTrades(symbol?: string): DemoTrade[] {
  try {
    const raw = localStorage.getItem(LS_TRADES);
    const all = raw ? (JSON.parse(raw) as DemoTrade[]) : [];
    return symbol ? all.filter((t) => t.symbol === symbol) : all;
  } catch {
    return [];
  }
}
function saveTrades(all: DemoTrade[]) {
  localStorage.setItem(LS_TRADES, JSON.stringify(all));
}

/* ============================
   PnL helpers (CFD didáctico)
============================ */
function sideSign(side: Side) { return side === "LONG" ? 1 : -1; }
function unrealized(trade: DemoTrade, mark: number) {
  return (mark - trade.entry) * sideSign(trade.side) * trade.qty;
}
function realized(trade: DemoTrade) {
  if (trade.exit == null) return 0;
  return (trade.exit - trade.entry) * sideSign(trade.side) * trade.qty;
}

/* ============================
   Ticket DEMO y simulador
============================ */

function DemoTicket({
  symbol,
  mark,
  onChange,
}: {
  symbol: string;
  mark: number | null;
  onChange?: (list: DemoTrade[], session: DemoSession) => void;
}) {
  const [side, setSide] = useState<Side>("LONG");
  const [amount, setAmount] = useState<number>(10); // USD por operación
  const [session, setSession] = useState<DemoSession>(() => loadSession());
  const [trades, setTrades] = useState<DemoTrade[]>(() => loadTrades(symbol));

  useEffect(() => { setTrades(loadTrades(symbol)); }, [symbol]);

  function openTrade() {
    if (mark == null || amount <= 0) return;
    const qty = amount / mark;
    const t: DemoTrade = {
      id: uuid(),
      symbol,
      side,
      qty,
      entry: mark,
      openedAt: Date.now(),
    };
    const all = [...loadTrades(), t];
    saveTrades(all);
    const my = all.filter((x) => x.symbol === symbol);
    setTrades(my);
    onChange?.(my, session);
  }

  function closeTrade(id: string) {
    const all = loadTrades();
    const idx = all.findIndex((t) => t.id === id);
    if (idx === -1 || mark == null) return;
    const t = { ...all[idx], exit: mark, closedAt: Date.now() };
    all[idx] = t;
    saveTrades(all);

    const my = all.filter((x) => x.symbol === symbol);
    setTrades(my);

    const realizedSum = loadTrades().reduce((acc, tr) => acc + realized(tr), 0);
    const ses: DemoSession = { ...session, baseCash: START_CASH + realizedSum };
    setSession(ses);
    saveSession(ses);
    onChange?.(my, ses);
  }

  const realizedSum = useMemo(
    () => trades.filter((t) => t.exit != null).reduce((a, t) => a + realized(t), 0),
    [trades],
  );
  const unreal = useMemo(() => {
    if (mark == null) return 0;
    return trades.filter((t) => t.exit == null).reduce((a, t) => a + unrealized(t, mark), 0);
  }, [trades, mark]);

  const cash = session.baseCash;
  const equity = cash + unreal;

  return (
    <div className="card p-4 space-y-4">
      <div className="text-sm opacity-80 mb-1">Modo demo — saldo base</div>
      <div className="text-2xl font-semibold">${START_CASH.toFixed(2)}</div>
      <div className="text-sm opacity-80">
        Equity actual:{" "}
        <span className="font-medium">
          {equity >= 0 ? "▲" : "▼"} ${equity.toFixed(2)}
        </span>
      </div>
      <div className="text-sm opacity-80">
        Realizado:{" "}
        <span className={realizedSum >= 0 ? "text-[--success]" : "text-[--danger]"}>
          {realizedSum >= 0 ? "▲" : "▼"} ${realizedSum.toFixed(2)}
        </span>
      </div>

      <div className="pt-2 border-t border-white/10 space-y-3">
        <div className="flex gap-2">
          <button className={`btn ${side === "LONG" ? "btn-primary" : ""}`} onClick={() => setSide("LONG")}>Long</button>
          <button className={`btn ${side === "SHORT" ? "btn-danger" : ""}`} onClick={() => setSide("SHORT")}>Short</button>
        </div>
        <label className="text-sm block">
          Monto (USD)
          <input
            type="range"
            min={1}
            max={100}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full"
          />
          <div className="text-xs opacity-70 mt-1">
            ${amount.toFixed(2)}{" "}
            {mark != null ? `(≈ ${(amount / mark).toFixed(6)} ${symbol.split("-")[0]})` : ""}
          </div>
        </label>
        <button className="btn btn-primary w-full" onClick={openTrade} disabled={mark == null || amount <= 0}>
          Abrir {side === "LONG" ? "Long" : "Short"} {mark != null ? `@ ${mark.toFixed(4)}` : ""}
        </button>
      </div>

      <div className="pt-2 border-t border-white/10">
        <div className="text-sm opacity-80 mb-2">Operaciones abiertas</div>
        {trades.filter((t) => t.exit == null).length === 0 && (
          <div className="text-xs opacity-60">Sin operaciones abiertas.</div>
        )}
        <div className="space-y-2">
          {trades.filter((t) => t.exit == null).map((t) => {
            const pnlNow = mark != null ? unrealized(t, mark) : 0;
            return (
              <div key={t.id} className="rounded-lg border border-white/10 p-2 flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-medium">
                    {t.side} {t.qty.toFixed(6)} @ {t.entry.toFixed(4)}
                  </div>
                  <div className="text-xs opacity-70">{fmtTime(t.openedAt)}</div>
                </div>
                <div className={`text-sm ${pnlNow >= 0 ? "text-[--success]" : "text-[--danger]"}`}>
                  {pnlNow >= 0 ? "▲" : "▼"} {pnlNow.toFixed(2)}
                </div>
                <button className="text-xs px-2 py-1 rounded hover:bg-white/10 ml-2" onClick={() => closeTrade(t.id)}>
                  Cerrar
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-2 border-t border-white/10">
        <div className="text-sm opacity-80 mb-2">Historial</div>
        {trades.filter((t) => t.exit != null).length === 0 && (
          <div className="text-xs opacity-60">Aún no cierras operaciones.</div>
        )}
        <div className="space-y-2">
          {trades.filter((t) => t.exit != null).map((t) => {
            const r = realized(t);
            return (
              <div key={t.id} className="rounded-lg border border-white/10 p-2 flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-medium">
                    {t.side} {t.qty.toFixed(6)} @ {t.entry.toFixed(4)} → {t.exit!.toFixed(4)}
                  </div>
                  <div className="text-xs opacity-70">{fmtTime(t.closedAt!)}</div>
                </div>
                <div className={`text-sm ${r >= 0 ? "text-[--success]" : "text-[--danger]"}`}>
                  {r >= 0 ? "▲" : "▼"} {r.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}



/* ============================
   Página Modo Demo (Paper)
============================ */

export default function PaperPage() {
  const params = useSearchParams();
  const initial = (params.get("symbol") || "BTC-USD").toUpperCase();

  const [symbol, setSymbol] = useState<string>(initial);
  const [mark, setMark] = useState<number | null>(null);

  const [rangeDelta, setRangeDelta] = useState<number | null>(null);
  const [rangeLabel, setRangeLabel] = useState<'1D'|'1W'|'1M'|'1Y'|'ALL'>('ALL');

  // dentro de <PaperPage/> justo antes del return:
  const [trades, setTrades] = useState(() => [] as ReturnType<typeof loadTrades>);
  useEffect(() => { setTrades(loadTrades(symbol)); }, [symbol]);

  const open = useMemo(() => trades.filter(t => t.symbol === symbol && t.exit == null), [trades, symbol]);
  const netQty = useMemo(() => open.reduce((a,t)=> a + (t.side === "LONG" ? t.qty : -t.qty), 0), [open]);
  const netNotional = useMemo(() => open.reduce((a,t)=> a + (t.side === "LONG" ? t.qty*t.entry : -t.qty*t.entry), 0), [open]);
  const breakeven = netQty !== 0 ? netNotional / netQty : null;


  // lista “rápida” para principiantes
  const suggestions = ["BTC-USD", "ETH-USD", "SPY", "TLT", "EURUSD=X", "GLD"] as const;

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Modo demo</h1>
              <p className="text-sm opacity-70">
                Practica con ${START_CASH} virtuales. Los precios son reales, las operaciones son simuladas.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                className="input"
                placeholder="Símbolo (ej. BTC-USD, SPY, EURUSD=X)"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              />
              <div className="hidden sm:flex items-center gap-1">
                {suggestions.map((s) => (
                  <button key={s} className={`chip ${symbol === s ? "chip--active" : ""}`} onClick={() => setSymbol(s)}>
                    {s}
                  </button>
                ))}
              </div>

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
          </header>

        <section className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            {/* Reutilización total del gráfico en tiempo real */}
           <MarketChartE
              symbol={symbol}
              provider="yahoo"
              onPrice={setMark}
              baseline={breakeven ?? null}
              emaDurationsMin={[20, 60]}
              useLiveMarketRange="max" // si expones este prop y se lo pasas al hook
              onRangeDelta={(d, r) => { setRangeDelta(d); setRangeLabel(r); }}  
            />
          </div>
          <div>
            <DemoTicket symbol={symbol} mark={mark} />
          </div>
        </section>

        <section className="card p-4 text-sm">
          <div className="font-medium mb-2">¿Cómo funciona?</div>
          <ul className="list-disc ml-5 space-y-1 opacity-80">
            <li><b>Long</b> gana si el precio sube; <b>Short</b> gana si el precio baja.</li>
            <li>Eliges cuánto invertir (USD) y calculamos la <em>cantidad</em> automáticamente.</li>
            <li>Tu saldo base es <b>${START_CASH}</b>. El “equity” sube o baja con tus resultados.</li>
            <li>Didáctico: sin dinero real ni comisiones.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
