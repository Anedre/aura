"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SymbolAvatar from "@/components/SymbolAvatar";
import { TechTerm } from "@/components/glossary/Glossary";
import { useLivePrice } from "@/hooks/useLivePrice";
import { getFeed, type FeedItem } from "@/lib/api.feed";
import { loadRiskProfile, listRequests, type InvestRequest } from "@/lib/invest";

type RiskSnapshot = ReturnType<typeof loadRiskProfile>;

type DemoTrade = {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  qty: number;
  entry: number;
  openedAt: number;
  exit?: number;
  closedAt?: number;
};

type PaperSummary = {
  capital: number;
  realized: number;
  openTrades: number;
  lastActivity: string | null;
};

type PaperData = {
  summary: PaperSummary;
  trades: DemoTrade[];
};

type FeedState = {
  loading: boolean;
  error: string | null;
  items: FeedItem[];
};

type SparkPoint = { label: string; value: number; ts: number };

const PAPER_START_CASH = 100;
const PAPER_SESSION_KEY = "paper_session_v1";
const PAPER_TRADES_KEY = "paper_trades_v1";
const WATCH_KEY = "aura_home_watch";
const WATCH_SYMBOLS = ["BTC-USD", "ETH-USD", "AAPL", "SPY", "TSLA", "QQQ"];
const DEFAULT_WATCH = WATCH_SYMBOLS[0];

function realizedPnL(trade: DemoTrade): number {
  if (trade.exit == null) return 0;
  const direction = trade.side === "LONG" ? 1 : -1;
  return (trade.exit - trade.entry) * direction * trade.qty;
}

function loadPaperData(): PaperData {
  try {
    const sessionRaw = localStorage.getItem(PAPER_SESSION_KEY);
    const tradesRaw = localStorage.getItem(PAPER_TRADES_KEY);

    const parsedSession = sessionRaw ? JSON.parse(sessionRaw) : null;
    const baseCash =
      parsedSession && typeof parsedSession.baseCash === "number"
        ? parsedSession.baseCash
        : PAPER_START_CASH;

    const parsedTrades = tradesRaw ? JSON.parse(tradesRaw) : [];
    const trades: DemoTrade[] = Array.isArray(parsedTrades) ? (parsedTrades as DemoTrade[]) : [];

    const realized = trades.reduce((acc, trade) => acc + realizedPnL(trade), 0);
    const openTrades = trades.filter((trade) => trade.exit == null).length;
    const lastActivity =
      trades.length > 0
        ? new Date(
            Math.max(
              ...trades.map((trade) =>
                trade.closedAt != null ? trade.closedAt : trade.openedAt,
              ),
            ),
          ).toISOString()
        : null;

    return {
      summary: { capital: baseCash, realized, openTrades, lastActivity },
      trades,
    };
  } catch {
    return {
      summary: { capital: PAPER_START_CASH, realized: 0, openTrades: 0, lastActivity: null },
      trades: [],
    };
  }
}

function buildPnlSeries(trades: DemoTrade[]): SparkPoint[] {
  const closed = trades
    .filter((trade) => trade.exit != null && trade.closedAt != null)
    .sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));
  const series: SparkPoint[] = [];
  let acc = 0;
  for (const trade of closed) {
    acc += realizedPnL(trade);
    const ts = trade.closedAt as number;
    series.push({
      ts,
      label: new Date(ts).toLocaleString("es-PE", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
      value: acc,
    });
  }
  if (series.length === 0) {
    series.push({ ts: Date.now(), label: "Sin historial aún", value: 0 });
  }
  return series;
}

function Sparkline({ data, accent }: { data: SparkPoint[]; accent: string }) {
  const [activeIndex, setActiveIndex] = useState(data.length - 1);
  useEffect(() => {
    setActiveIndex(data.length - 1);
  }, [data.length]);

  if (data.length === 0) {
    return <div className="text-xs opacity-70">Sin datos todavía.</div>;
  }

  const width = 260;
  const height = 84;
  const values = data.map((point) => point.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const points = data.map((point, index) => {
    const x = index * step;
    const y = height - ((point.value - min) / span) * height;
    return { ...point, x, y };
  });

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");

  const activePoint = points[Math.max(0, Math.min(points.length - 1, activeIndex))];

  function handlePointer(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / width));
    const index = Math.round(ratio * (points.length - 1));
    setActiveIndex(index);
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-24 w-full cursor-pointer"
        onMouseMove={handlePointer}
        onMouseLeave={() => setActiveIndex(points.length - 1)}
      >
        <defs>
          <linearGradient id="sparkGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={accent} stopOpacity={0.5} />
            <stop offset="100%" stopColor={accent} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <path
          d={`${path} L${points.at(-1)?.x ?? width},${height} L0,${height} Z`}
          fill="url(#sparkGradient)"
          stroke="none"
        />
        <path d={path} fill="none" stroke={accent} strokeWidth={2.4} strokeLinecap="round" />
        <g>
          <circle cx={activePoint.x} cy={activePoint.y} r={4} fill="#ffffff" stroke={accent} strokeWidth={2} />
        </g>
      </svg>
      <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs leading-relaxed">
        <div className="flex items-center justify-between gap-4">
          <span className="opacity-70">{activePoint.label}</span>
          <span className="font-semibold text-white/90">
            {activePoint.value.toLocaleString("es-PE", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [risk, setRisk] = useState<RiskSnapshot>(null);
  const [feedState, setFeedState] = useState<FeedState>({ loading: true, error: null, items: [] });
  const [paperData, setPaperData] = useState<PaperData>(() => loadPaperData());
  const [requests, setRequests] = useState<InvestRequest[]>([]);
  const [watchSymbol, setWatchSymbol] = useState<string>(DEFAULT_WATCH);

  useEffect(() => {
    setRisk(loadRiskProfile());
  }, []);

  useEffect(() => {
    async function fetchFeed() {
      setFeedState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await getFeed({ limit: 8, horizon: "1d", min_conf: 0.55 });
        const sorted = [...data].sort((a, b) => (b.p_conf ?? 0) - (a.p_conf ?? 0));
        setFeedState({ loading: false, error: null, items: sorted.slice(0, 5) });
      } catch (err) {
        setFeedState({
          loading: false,
          error: err instanceof Error ? err.message : "No fue posible cargar el feed.",
          items: [],
        });
      }
    }
    void fetchFeed();
  }, []);

  useEffect(() => {
    setPaperData(loadPaperData());
  }, []);

  useEffect(() => {
    try {
      setRequests(listRequests().slice(0, 4));
    } catch {
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(WATCH_KEY);
      if (stored) setWatchSymbol(stored);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(WATCH_KEY, watchSymbol);
    } catch {
      // ignore
    }
  }, [watchSymbol]);

  const { price: livePrice } = useLivePrice(watchSymbol);

  const watchOptions = useMemo(() => {
    const pool = new Set<string>([...WATCH_SYMBOLS, watchSymbol, ...feedState.items.map((item) => item.symbol)]);
    return Array.from(pool).sort();
  }, [feedState.items, watchSymbol]);

  const watchedFeed = useMemo(
    () => feedState.items.find((item) => item.symbol === watchSymbol) ?? null,
    [feedState.items, watchSymbol],
  );

  const recommendation = useMemo(
    () => feedState.items[0] ?? null,
    [feedState.items],
  );

  const secondarySignals = useMemo(() => {
    if (!recommendation) return feedState.items.slice(0, 3);
    return feedState.items.filter((item) => item.symbol !== recommendation.symbol).slice(0, 3);
  }, [feedState.items, recommendation]);

  const pnlSeries = useMemo(() => buildPnlSeries(paperData.trades), [paperData.trades]);

  const requestsStats = useMemo(() => {
    if (requests.length === 0) return { total: 0, upcoming: null as InvestRequest | null, amount: 0 };
    const amount = requests.reduce((acc, request) => acc + request.amount, 0);
    const upcoming = [...requests].sort((a, b) => a.execDate.localeCompare(b.execDate))[0] ?? null;
    return { total: requests.length, upcoming, amount };
  }, [requests]);

  const riskHorizonYears = risk?.inputs?.horizonYears ?? null;

  const currency = useMemo(
    () =>
      new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }),
    [],
  );

  const priceFormatter = useMemo(
    () =>
      new Intl.NumberFormat("es-PE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }),
    [],
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("es-PE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    [],
  );

  const deltaInfo = useMemo(() => {
    if (!watchedFeed || watchedFeed.last_close == null || livePrice == null) return null;
    const delta = livePrice - watchedFeed.last_close;
    const pct = (delta / watchedFeed.last_close) * 100;
    return { delta, pct };
  }, [livePrice, watchedFeed]);
  const [canStartTour, setCanStartTour] = useState(false);

  useEffect(() => {
    setCanStartTour(true);
  }, []);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
        <header className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--muted)] px-5 py-6 shadow space-y-3" data-tour="home-summary">
          <p className="text-xs uppercase tracking-[0.28em] text-[--primary]">Panel AURA</p>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2 min-w-[240px] flex-1">
              <h1 className="text-3xl font-bold tracking-tight">Tu dashboard de inversión</h1>
              <p className="text-sm opacity-75">
                Controla tus señales, practica en modo <TechTerm term="paper trading" label="demo" /> y da seguimiento a tus solicitudes desde un mismo lugar.
              </p>
            </div>
            {canStartTour && (
              <button
                type="button"
                className="btn btn-ghost whitespace-nowrap"
                onClick={() => window.dispatchEvent(new CustomEvent("aura-tour:start"))}
              >
                Ver tour interactivo
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link
              href="/risk"
              className="rounded-xl border border-[color:var(--border)] bg-white/5 px-3 py-3 text-sm transition hover:bg-white/10"
            >
              <div className="text-xs uppercase opacity-60">Perfil de riesgo</div>
              <div className="mt-1 text-base font-semibold">
                {risk?.profile ?? "Pendiente"}
              </div>
              <div className="mt-1 text-xs opacity-70">
                {risk ? `Puntaje ${risk.score}/100` : "Define tu perfil para personalizar señales."}
              </div>
            </Link>
            <Link
              href="/paper"
              className="rounded-xl border border-[color:var(--border)] bg-white/5 px-3 py-3 text-sm transition hover:bg-white/10"
            >
              <div className="text-xs uppercase opacity-60">Modo demo</div>
              <div className="mt-1 text-base font-semibold">
                {currency.format(paperData.summary.capital)}
              </div>
              <div className="mt-1 text-xs opacity-70">
                {paperData.summary.openTrades} operaciones abiertas · {currency.format(paperData.summary.realized)} realizado
              </div>
            </Link>
            <Link
              href="/invest/request"
              className="rounded-xl border border-[color:var(--border)] bg-white/5 px-3 py-3 text-sm transition hover:bg-white/10"
            >
              <div className="text-xs uppercase opacity-60">Solicitudes IA</div>
              <div className="mt-1 text-base font-semibold">
                {requestsStats.total > 0 ? `${requestsStats.total} activas` : "Sin solicitudes"}
              </div>
              <div className="mt-1 text-xs opacity-70">
                {requestsStats.total > 0
                  ? `${currency.format(requestsStats.amount)} programados`
                  : "Pide una predicción personalizada cuando lo necesites."}
              </div>
            </Link>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <article className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--muted)] px-5 py-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <TechTerm term="pnl" label="PnL" /> del modo <TechTerm term="paper trading" label="demo" />
                </h2>
                <p className="text-xs opacity-70">
                  Evolución de tus operaciones en <TechTerm term="paper trading" label="modo demo" /> cerradas.
                </p>
              </div>
              <Link href="/paper" className="text-xs text-[--primary] hover:underline">
                Ver detalle
              </Link>
            </div>
            <div className="mt-5">
              <Sparkline data={pnlSeries} accent="var(--primary)" />
            </div>
            <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
              <div>
                <div className="opacity-70">Capital actual</div>
                <div className="mt-1 text-sm font-semibold">
                  {currency.format(paperData.summary.capital)}
                </div>
              </div>
              <div>
                <div className="opacity-70">
                  <TechTerm term="pnl" label="PnL" /> realizado
                </div>
                <div className={`mt-1 text-sm font-semibold ${paperData.summary.realized >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {currency.format(paperData.summary.realized)}
                </div>
              </div>
              <div>
                <div className="opacity-70">Última actividad</div>
                <div className="mt-1 text-sm">
                  {paperData.summary.lastActivity
                    ? dateFormatter.format(new Date(paperData.summary.lastActivity))
                    : "Sin operaciones aún"}
                </div>
              </div>
            </div>
          </article>

          <div className="flex flex-col gap-4">
            <article className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--muted)] px-5 py-5 shadow-sm" data-tour="home-watch">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase opacity-60">Seguimiento en vivo</div>
                  <div className="mt-1 flex items-center gap-2">
                    <SymbolAvatar symbol={watchSymbol} size={18} />
                    <span className="text-base font-semibold">{watchSymbol}</span>
                  </div>
                </div>
                <select
                  aria-label="Seleccionar símbolo para seguimiento"
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs"
                  value={watchSymbol}
                  onChange={(event) => setWatchSymbol(event.target.value)}
                >
                  {watchOptions.map((symbol) => (
                    <option key={symbol} value={symbol}>
                      {symbol}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                <div className="flex items-end gap-3">
                  <div className="text-2xl font-semibold tracking-tight">
                    {livePrice != null ? priceFormatter.format(livePrice) : "—"}
                  </div>
                  {deltaInfo && (
                    <span className={`text-xs font-medium ${deltaInfo.delta >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {deltaInfo.delta >= 0 ? "▲" : "▼"} {priceFormatter.format(Math.abs(deltaInfo.delta))}
                    </span>
                  )}
                </div>
                {deltaInfo && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      deltaInfo.pct >= 0 ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"
                    }`}
                  >
                    {deltaInfo.pct >= 0 ? "↑" : "↓"} {Math.abs(deltaInfo.pct).toFixed(2)}% hoy
                  </span>
                )}
              </div>
              <div className="mt-3 text-xs opacity-70">
                {watchedFeed ? (
                  <>
                    Señal:{" "}
                    <span className="font-medium">
                      {watchedFeed.action === "BUY"
                        ? "Sube"
                        : watchedFeed.action === "SELL"
                          ? "Baja"
                          : watchedFeed.action === "HOLD"
                            ? "En espera"
                            : "Sin señal"}
                    </span>
                    {" · "}
                    <TechTerm term="certeza" />{" "}
                    {watchedFeed.p_conf != null ? `${Math.round(watchedFeed.p_conf * 100)}%` : "N/D"}
                    {" · "}
                    <TechTerm term="horizonte" /> {watchedFeed.horizon ?? "1d"}
                  </>
                ) : (
                  "Explora el feed para obtener contexto adicional."
                )}
              </div>
              {deltaInfo && (
                <div className="mt-1 text-[11px] opacity-60">
                  Variación comparada con el <TechTerm term="cierre" label="último cierre" /> del activo.
                </div>
              )}
            </article>

            <article className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--muted)] px-5 py-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase opacity-60">Recomendación del día</div>
                  <div className="mt-1 text-base font-semibold">
                    {recommendation ? recommendation.symbol : "Pendiente"}
                  </div>
                </div>
                {recommendation && (
                  <Link href={`/asset/${encodeURIComponent(recommendation.symbol)}`} className="text-xs text-[--primary] hover:underline">
                    Ver detalle
                  </Link>
                )}
              </div>
              {recommendation ? (
                <div className="mt-3 space-y-2 text-xs opacity-80">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide">
                      {recommendation.action === "BUY"
                        ? "Sube"
                        : recommendation.action === "SELL"
                          ? "Baja"
                          : recommendation.action === "HOLD"
                            ? "En espera"
                            : "Sin señal"}
                    </span>
                    <span>
                      <TechTerm term="certeza" />{" "}
                      {recommendation.p_conf != null ? `${Math.round(recommendation.p_conf * 100)}%` : "N/D"}
                    </span>
                  </div>
                  <div>
                    <TechTerm term="horizonte" />: <strong>{recommendation.horizon ?? "1d"}</strong>
                  </div>
                  {recommendation.last_close != null && (
                    <div>
                      Último cierre:{" "}
                      {recommendation.last_close.toLocaleString("es-PE", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  )}
                  <p className="pt-2 text-[11px] opacity-70">
                    Activa el <TechTerm term="paper trading" label="modo demo" /> o el{" "}
                    <TechTerm term="simulador" /> para validar esta idea antes de operar en real.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs opacity-75">
                  Cuando se genere una señal con alta certeza la verás aquí primero.
                </p>
              )}
            </article>
          </div>
        </section>

        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase opacity-70">Señales destacadas</h2>
            <Link href="/feed" className="text-xs text-[--primary] hover:underline">
              Ver todas las señales
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {feedState.loading ? (
              [0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="h-32 rounded-2xl border border-[color:var(--border)] bg-white/5 animate-pulse"
                />
              ))
            ) : feedState.error ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-200 sm:col-span-3">
                {feedState.error}
              </div>
            ) : secondarySignals.length === 0 ? (
              <div className="rounded-2xl border border-[color:var(--border)] bg-white/5 px-4 py-4 text-sm opacity-75 sm:col-span-3">
                No hay señales disponibles con los filtros actuales. Revisa el feed para más opciones.
              </div>
            ) : (
              secondarySignals.map((item) => (
                <Link
                  key={item.symbol}
                  href={`/asset/${encodeURIComponent(item.symbol)}`}
                  className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--muted)] px-4 py-4 text-sm transition hover:bg-white/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase opacity-60">Símbolo</div>
                      <div className="text-base font-semibold">{item.symbol}</div>
                    </div>
                    <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-xs font-medium">
                      {item.action === "BUY"
                        ? "Sube"
                        : item.action === "SELL"
                          ? "Baja"
                          : item.action === "HOLD"
                            ? "En espera"
                            : "Sin señal"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs opacity-75">
                    <span>
                      <TechTerm term="certeza" />:{" "}
                      {item.p_conf != null ? `${Math.round(item.p_conf * 100)}%` : "N/D"}
                    </span>
                    <span>
                      <TechTerm term="horizonte" />: {item.horizon ?? "1d"}
                    </span>
                 </div>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--muted)] px-4 py-5 shadow-sm">
            <h3 className="text-base	font-semibold">Mi actividad reciente</h3>
            <ul className="mt-3 space-y-2 text-sm opacity-80">
              <li>
                Perfil de <TechTerm term="riesgo" />: {risk?.profile ?? "Pendiente"}{" "}
                {riskHorizonYears != null && (
                  <>
                    (<TechTerm term="horizonte" /> {riskHorizonYears} años)
                  </>
                )}
              </li>
              <li>
                Capital en <TechTerm term="paper trading" label="modo demo" />: {currency.format(paperData.summary.capital)} · {paperData.summary.openTrades} operaciones abiertas
              </li>
              <li>
                Solicitudes recientes: {requestsStats.total} ·{" "}
                {requestsStats.upcoming
                  ? `Próxima ejecución ${dateFormatter.format(new Date(requestsStats.upcoming.execDate))}`
                  : "Agenda tu próxima solicitud cuando estés listo."}
              </li>
              <li>
                {paperData.summary.lastActivity ? (
                  <>
                    Última operación en <TechTerm term="paper trading" label="modo demo" />:{" "}
                    {dateFormatter.format(new Date(paperData.summary.lastActivity))}
                  </>
                ) : (
                  <>
                    Aún no ejecutas operaciones en <TechTerm term="paper trading" label="modo demo" />.
                  </>
                )}
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--muted)] px-4 py-5 shadow-sm">
            <h3 className="text-base font-semibold">Solicitudes IA recientes</h3>
            {requests.length === 0 ? (
              <p className="mt-3 text-sm opacity-75">
                Cuando registres solicitudes de análisis, las verás aquí con sus fechas de ejecución.
              </p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm opacity-80">
                {requests.map((request) => (
                  <li key={request.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{request.symbol}</div>
                      <span className="text-xs opacity-70">
                        {dateFormatter.format(new Date(request.execDate))}
                      </span>
                    </div>
                    <div className="mt-1 text-xs opacity-70">
                      Monto: {currency.format(request.amount)} · Cuenta: {request.sourceAccount}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/invest/request" className="mt-4 inline-flex text-xs text-[--primary] hover:underline">
              Crear nueva solicitud
            </Link>
          </div>
        </section>

        <section className="grid gap-3">
          <h2 className="text-sm font-semibold uppercase opacity-70">Accesos rápidos</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                href: "/feed",
                title: "Revisar señales",
                description: "Explora las oportunidades recomendadas para hoy.",
              },
              {
                href: "/paper",
                title: "Modo demo",
                description: "Practica estrategias sin riesgo con tu cuenta virtual.",
              },
              {
                href: "/simulator",
                title: "Simulador",
                description: "Modela escenarios en segundos y compara resultados.",
              },
              {
                href: "/invest/request",
                title: "Solicitudes IA",
                description: "Pide un análisis personalizado o una predicción puntual.",
              },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--muted)] px-4 py-4 text-sm transition hover:bg-white/10"
              >
                <div className="text-base font-semibold">{action.title}</div>
                <p className="mt-2 text-xs opacity-70">{action.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
