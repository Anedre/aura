"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
const MarketChartE = dynamic(() => import("@/components/MarketChartE"), { ssr: false });
import PriceTicker from "@/components/PriceTicker";
import SymbolAvatar from "@/components/SymbolAvatar";
import AssetHover from "@/components/AssetHover";
// import RealtimePrice from "@/components/RealtimePrice";
// import WsDebugStatus from "@/components/WsDebugStatus";

import {
  simulateInvestment,
  type SimInput,
  scoreRisk,
  type RiskInputs,
  type RiskProfile,
} from "@/lib/invest";
import { getFeed, type FeedItem } from "@/lib/api.feed";

// ===== Helpers (módulo) para derivar y evaluar ideas del feed =====
function tourHorizonToPeriodsPerYear(h?: string): number {
  if (!h) return 12;
  if (h === "1d") return 252;
  if (h === "1w") return 52;
  if (h === "1h") return 252 * 6;
  if (typeof h === "string" && h.endsWith("m")) {
    const m = Number(h.replace("m", ""));
    return m > 0 ? (12 * 60) / m : 12;
  }
  return 12;
}
function tourAnnualizeReturn(mu_h: number, ppy: number): number {
  return Math.pow(1 + mu_h, Math.max(1, ppy)) - 1;
}
function tourAnnualizeVol(sigma_h: number, ppy: number): number {
  return sigma_h * Math.sqrt(Math.max(1, ppy));
}
function tourDeriveFromFeed(it: FeedItem): { muA: number; sigA: number } | null {
  const conf = typeof it.p_conf === "number" ? Math.max(0, Math.min(1, it.p_conf)) : 0.5;
  const ppy = tourHorizonToPeriodsPerYear(it.horizon as string | undefined);
  const px = it.last_close ?? null;
  let mu_h = 0;
  let sig_h: number | null = null;
  if (typeof it.sigma === "number" && Number.isFinite(it.sigma)) sig_h = Math.max(0, it.sigma);
  if (px && it.stops && typeof it.stops.tp === "number" && typeof it.stops.sl === "number") {
    const rTp = it.stops.tp / px - 1;
    const rSl = it.stops.sl / px - 1;
    if (it.action === "BUY") mu_h = conf * rTp + (1 - conf) * rSl;
    else if (it.action === "SELL") mu_h = conf * (-Math.abs(rSl)) + (1 - conf) * Math.abs(rTp);
    else mu_h = conf * rTp + (1 - conf) * rSl;
    if (sig_h == null) sig_h = (Math.abs(rTp) + Math.abs(rSl)) / 2;
  } else {
    const base = 0.01;
    if (it.action === "BUY") mu_h = conf * base;
    else if (it.action === "SELL") mu_h = -conf * base;
    else mu_h = 0;
    if (sig_h == null) sig_h = 0.02;
  }
  return { muA: tourAnnualizeReturn(mu_h, ppy), sigA: tourAnnualizeVol(sig_h ?? 0.02, ppy) };
}
function tourScoreIdea(it: FeedItem, monthsSim: number, style: RiskProfile): number {
  const conf = Math.max(0, Math.min(1, it.p_conf ?? 0));
  const hasStops = !!(it.stops && typeof it.stops.tp === "number" && typeof it.stops.sl === "number");
  const d = tourDeriveFromFeed(it);
  const muA = d?.muA ?? 0;
  const sigA = d?.sigA ?? 0.02;
  const px = it.last_close ?? 1;
  const rr = hasStops ? Math.min(3, Math.abs((it.stops!.tp / px - 1)) / Math.max(0.001, Math.abs((it.stops!.sl / px - 1)))) : 1;
  const hours = it.ts ? Math.max(0, (Date.now() - new Date(it.ts).getTime()) / 36e5) : 999;
  const rec = Math.exp(-hours / 72);
  const horizon = (it.horizon as string | undefined) ?? "1d";
  const monthsIdea = horizon === "1w" ? 3 : 1;
  const align = Math.exp(-Math.abs(monthsSim - monthsIdea) / 12);
  const qual = hasStops || typeof it.sigma === "number" ? 1 : 0.5;
  const muNorm = 1 / (1 + Math.exp(-6 * muA));
  const sigNorm = Math.min(1, sigA / 0.6);
  const w = style === "Conservador" ? { mu: 0.10, sig: 0.15 } : style === "Agresivo" ? { mu: 0.20, sig: 0.05 } : { mu: 0.15, sig: 0.10 };
  const base = 0.35 * conf + 0.15 * rr + 0.10 * rec + 0.10 * align + 0.10 * qual + w.mu * muNorm - w.sig * sigNorm;
  return base;
}

type SimOut = ReturnType<typeof simulateInvestment>;

const PRESETS: Array<{ name: string; initial: number; monthly: number; months: number }> = [
  { name: "Primeros pasos", initial: 300, monthly: 50, months: 12 },
  { name: "Meta 3 años", initial: 1000, monthly: 120, months: 36 },
  { name: "Plan 5 años", initial: 1500, monthly: 150, months: 60 },
];

const RISK_LEVELS: Record<RiskProfile, { r: number; vol: number; label: string }> = {
  Conservador: { r: 0.06, vol: 0.10, label: "Más estable, menor riesgo" },
  Moderado: { r: 0.10, vol: 0.18, label: "Equilibrio riesgo/retorno" },
  Agresivo: { r: 0.15, vol: 0.30, label: "Más potencial, más subidas/bajadas" },
};

const SYMBOLS = ["SPY", "AAPL", "BTC-USD"] as const;
// Lista para buscador (similar a paper trading)
const SEARCH_LIST = [
  "BTC-USD","ETH-USD","SPY","TLT","GLD","QQQ","AAPL","MSFT","TSLA","AMZN","NVDA","META","GOOG",
  "EURUSD=X","USDJPY=X","GBPUSD=X","USDCAD=X","DOGE-USD","SOL-USD","ADA-USD"
] as const;

export default function SimulatorPage() {
  const search = useSearchParams();
  const [symbol, setSymbol] = useState<string>("SPY");
  const [risk, setRisk] = useState<RiskProfile>("Moderado");
  const [showHelp, setShowHelp] = useState<boolean>(true);
  const [tourOpen, setTourOpen] = useState<boolean>(false);
  const [feedLoading, setFeedLoading] = useState<boolean>(false);
  const [feedErr, setFeedErr] = useState<string | null>(null);
  const [feedList, setFeedList] = useState<FeedItem[] | null>(null);
  const [feedChoice, setFeedChoice] = useState<string | null>(null); // symbol|idx key
  // Buscador de símbolo (mercado en vivo)
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [ideasOpen, setIdeasOpen] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");

  const [inp, setInp] = useState<SimInput>({
    initial: 1000,
    monthly: 100,
    months: 60,
    annualReturn: RISK_LEVELS["Moderado"].r,
    annualVol: RISK_LEVELS["Moderado"].vol,
    annualFee: 0.01,
    paths: 1000,
  });
  const [queryApplied, setQueryApplied] = useState(false);

  // Resultado calculado con una pequeña espera para no recalcular en cada cambio
  const [out, setOut] = useState<SimOut | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (inp.initial > 0 && inp.months >= 1) setOut(simulateInvestment(inp));
      else setOut(null);
    }, 200);
    return () => window.clearTimeout(id);
  }, [inp]);

  // Prefill desde querystring (para abrir desde el feed)
  useEffect(() => {
    if (queryApplied) return;
    try {
      const qs_symbol = search.get("symbol");
      const qs_mu = search.get("mu");
      const qs_sigma = search.get("sigma");
      const qs_months = search.get("months");
      const qs_initial = search.get("initial");
      const qs_monthly = search.get("monthly");

      if (qs_symbol) setSymbol(qs_symbol);

      const mu = qs_mu != null ? Number(qs_mu) : undefined;
      const sigma = qs_sigma != null ? Number(qs_sigma) : undefined;
      const months = qs_months != null ? Number(qs_months) : undefined;
      const initial = qs_initial != null ? Number(qs_initial) : undefined;
      const monthly = qs_monthly != null ? Number(qs_monthly) : undefined;

      if (
        (mu != null && Number.isFinite(mu)) ||
        (sigma != null && Number.isFinite(sigma)) ||
        (months != null && Number.isFinite(months)) ||
        (initial != null && Number.isFinite(initial)) ||
        (monthly != null && Number.isFinite(monthly))
      ) {
        setInp((x) => ({
          ...x,
          annualReturn: typeof mu === "number" && Number.isFinite(mu) ? (Math.abs(mu) > 1 ? mu / 100 : mu) : x.annualReturn,
          annualVol: typeof sigma === "number" && Number.isFinite(sigma) ? (Math.abs(sigma) > 1 ? sigma / 100 : sigma) : x.annualVol,
          months: typeof months === "number" && Number.isFinite(months) ? Math.max(1, Math.round(months)) : x.months,
          initial: typeof initial === "number" && Number.isFinite(initial) ? Math.max(0, initial) : x.initial,
          monthly: typeof monthly === "number" && Number.isFinite(monthly) ? Math.max(0, monthly) : x.monthly,
        }));
      }
    } catch {
      // ignore
    } finally {
      setQueryApplied(true);
    }
  }, [search, queryApplied]);

  // ROI del escenario &quot;típico&quot;
  const roiMedian = useMemo(() => {
    if (!out) return 0;
    const gain = out.p50 - inp.initial;
    return (gain / Math.max(1, inp.initial)) * 100;
  }, [out, inp.initial]);

  // Helpers de UI
  const nf = (x: number, min = 0, max = 2) =>
    x.toLocaleString("es-ES", { minimumFractionDigits: min, maximumFractionDigits: max });
  const money = (x: number) => x.toLocaleString("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 2 });

  // Utilidades: anualizar retorno de un horizonte y anualizar sigma
  function horizonToPeriodsPerYear(h?: string): number {
    if (!h) return 12; // default
    if (h === "1d") return 252;
    if (h === "1w") return 52;
    if (h === "1h") return 252 * 6; // aprox sesiones (6h/día)
    if (h.endsWith("m")) {
      const m = Number(h.replace("m", ""));
      return m > 0 ? (12 * 60) / m : 12;
    }
    return 12;
  }
  function annualizeReturn(mu_h: number, periodsPerYear: number): number {
    // convierte retorno por periodo (simple) a retorno compuesto anual
    return Math.pow(1 + mu_h, Math.max(1, periodsPerYear)) - 1;
  }
  function annualizeVol(sigma_h: number, periodsPerYear: number): number {
    return sigma_h * Math.sqrt(Math.max(1, periodsPerYear));
  }

  function expFromFeed(item: FeedItem): { rAnnual: number; volAnnual: number } | null {
    const conf = typeof item.p_conf === "number" ? Math.max(0, Math.min(1, item.p_conf)) : 0.5;
    const ppy = horizonToPeriodsPerYear(item.horizon as string | undefined);
    const px = item.last_close ?? null;

    let mu_h = 0; // retorno esperado en el horizonte del feed
    let sig_h: number | null = null;

    // 1) Si el modelo entrega sigma, úsalo como desviación horizonte
    if (typeof item.sigma === "number" && isFinite(item.sigma)) sig_h = Math.max(0, item.sigma);

    // 2) Si hay stops, usa TP/SL para estimar un retorno esperado ponderado por confianza
    if (px && item.stops && typeof item.stops.tp === "number" && typeof item.stops.sl === "number") {
      const rTp = item.stops.tp / px - 1;
      const rSl = item.stops.sl / px - 1;
      if (item.action === "BUY") {
        mu_h = conf * rTp + (1 - conf) * rSl; // esperanza ponderada
      } else if (item.action === "SELL") {
        // para venta, interpretamos r negativos como favorables
        mu_h = conf * (-Math.abs(rSl)) + (1 - conf) * Math.abs(rTp);
      } else {
        mu_h = conf * rTp + (1 - conf) * rSl;
      }
      if (sig_h == null) {
        // magnitud promedio como proxy de sigma de horizonte
        sig_h = (Math.abs(rTp) + Math.abs(rSl)) / 2;
      }
    } else {
      // 3) Sin stops: asigna un pequeño sesgo según acción y confianza
      const base = 0.01; // 1% por periodo, educativo
      if (item.action === "BUY") mu_h = conf * base;
      else if (item.action === "SELL") mu_h = -conf * base;
      else mu_h = 0;
      if (sig_h == null) sig_h = 0.02; // 2% por periodo, educativo
    }

    const rAnnual = annualizeReturn(mu_h, ppy);
    const volAnnual = annualizeVol(sig_h ?? 0.02, ppy);
    return { rAnnual, volAnnual };
  }

  async function loadFeedForSymbol(sym: string) {
    try {
      setFeedErr(null); setFeedLoading(true);
      const items = await getFeed({ symbol: sym });
      setFeedList(items);
      setFeedChoice(items.length ? `${sym}|0` : null);
    } catch (e) {
      setFeedErr(e instanceof Error ? e.message : String(e));
      setFeedList(null);
    } finally {
      setFeedLoading(false);
    }
  }

  // (acciones del tour removidas; ahora se usa el slide de selección IA dentro del tour)

  // Barra de percentiles sin solapamiento (ticks + leyenda en 3 columnas)
  const PBar = ({ p5, p50, p95 }: { p5: number; p50: number; p95: number }) => {
    const maxV = Math.max(p95, inp.initial * 1.2);
    const asPct = (v: number) => `${Math.min(100, Math.max(0, (v / maxV) * 100)).toFixed(1)}%`;
    return (
      <div className="mt-2">
        <div className="h-2 rounded bg-white/10 relative overflow-hidden">
          <div className="absolute left-0 top-0 h-full bg-emerald-500/30" style={{ width: asPct(p95) }} />
          {[{v:p5,k:'P5',desc:'Escenario malo (5%)'},{v:p50,k:'P50',desc:'Típico (mediana)'},{v:p95,k:'P95',desc:'Optimista (95%)'}].map((m, i) => (
            <div key={i} className="absolute top-0 bottom-0" style={{ left: asPct(m.v) }}>
              <div className="absolute top-0 bottom-0 w-px bg-white/40" />
              <div className="absolute -top-1.5 -translate-x-1/2 h-3 w-3 rounded-full border border-white/60 bg-white/90" title={`${m.k}: ${money(m.v)} · ${m.desc}`} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2 text-[11px] opacity-80">
          <div className="text-left">↓ Escenario malo (5%): {money(p5)}</div>
          <div className="text-center">• Típico (mediana): {money(p50)}</div>
          <div className="text-right">↑ Optimista (95%): {money(p95)}</div>
        </div>
      </div>
    );
  };

  // Mini-cuestionario opcional para calcular perfil
  const [rq, setRq] = useState<RiskInputs>({
    age: 28,
    horizonYears: Math.max(1, Math.round(inp.months / 12)),
    experience: "none",
    incomeStability: "medium",
    maxDrawdownTolerance: "20",
  });
  const [rqOpen, setRqOpen] = useState(false);
  const rqResult = useMemo(() => scoreRisk(rq), [rq]);

  useEffect(() => {
    // Sincroniza horizonte del cuestionario con la UI principal
    setRq((prev) => ({ ...prev, horizonYears: Math.max(1, Math.round(inp.months / 12)) }));
  }, [inp.months]);

  // Tour: abrir automáticamente la primera vez (persistido en localStorage)
  useEffect(() => {
    try {
      const TOUR_KEY = "aura_sim_tour_seen_v1";
      const seen = localStorage.getItem(TOUR_KEY);
      if (!seen) {
        setTourOpen(true);
        localStorage.setItem(TOUR_KEY, "1");
      }
    } catch {
      /* noop */
    }
  }, []);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      {/* más ancho que 4xl para el layout con gráfico */}
      <div className="max-w-[1200px] mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-5 sm:space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Simulador para empezar a invertir</h1>
            <p className="opacity-80 mt-1 text-sm">Juega con montos, tiempo y estilo. Te explicamos cada concepto en lenguaje sencillo.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={() => setTourOpen(true)}>Cómo funciona</button>
            <button className="btn" onClick={() => setShowHelp((v) => !v)}>{showHelp ? "Modo compacto" : "Modo explicado"}</button>
          </div>
        </header>

        {/* Importante: alcance del modelo */}
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-amber-100">
          <div className="font-semibold">Importante</div>
          <div className="text-sm opacity-90">
            Tu modelo de IA evalúa el próximo cierre (día siguiente). Este simulador es educativo y no anualiza
            esa señal ni construye carteras buy‑and‑hold a partir del modelo. Úsalo para explorar supuestos,
            no como proyección del modelo diario.
          </div>
        </div>
        {/* WS Debug deshabilitado para modo 100% local */}
        {/* Presets rápidos */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              className="chip hover:bg-white/10"
              onClick={() => setInp((x) => ({ ...x, initial: p.initial, monthly: p.monthly, months: p.months }))}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Grid: izquierda simulador, derecha gráfico en vivo */}
        <section className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6">
          {/* Lado izquierdo: flujo guiado */}
          <div className="space-y-5">
            <div className="card p-5">
              <div className="text-sm opacity-80 mb-2">Paso 1: Monto y aporte</div>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="text-sm">
                  Monto inicial
                  <input
                    type="number"
                    className="input mt-1"
                    min={1}
                    value={inp.initial}
                    onChange={(e) => setInp({ ...inp, initial: Number(e.target.value) })}
                  />
                  {showHelp && <div className="text-xs opacity-70 mt-1">Lo que pones hoy. Puede ser pequeño; lo importante es empezar.</div>}
                </label>
                <label className="text-sm">
                  Aporte mensual
                  <input
                    type="number"
                    className="input mt-1"
                    min={0}
                    value={inp.monthly}
                    onChange={(e) => setInp({ ...inp, monthly: Number(e.target.value) })}
                  />
                  {showHelp && <div className="text-xs opacity-70 mt-1">Un hábito mensual. Aporta aunque sea poco; el interés compuesto hace magia con el tiempo.</div>}
                </label>
              </div>
              <div className="mt-3">
                <input
                  type="range"
                  min={0}
                  max={1000}
                  step={10}
                  value={Math.min(1000, inp.monthly)}
                  onChange={(e) => setInp({ ...inp, monthly: Number(e.target.value) })}
                  className="w-full"
                />
                {showHelp && <div className="text-[11px] opacity-70 mt-1">Desliza para ver cómo cambia el resultado con tu aporte mensual.</div>}
              </div>
            </div>

            <div className="card p-5">
              <div className="text-sm opacity-80 mb-2">Paso 2: Tiempo</div>
              <label className="text-sm block">
                Horizonte: {Math.round(inp.months / 12)} años
                <input
                  type="range"
                  min={6}
                  max={360}
                  step={6}
                  className="w-full mt-2"
                  value={inp.months}
                  onChange={(e) => setInp({ ...inp, months: Number(e.target.value) })}
                />
                {showHelp && <div className="text-xs opacity-70 mt-1">Es el tiempo que planeas mantener tu inversión. Más tiempo suele reducir el riesgo de terminar en pérdida.</div>}
              </label>
            </div>

            <div className="card p-5">
              <div className="text-sm opacity-80 mb-2">Paso 3: Tu estilo (riesgo)</div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(RISK_LEVELS) as RiskProfile[]).map((k) => (
                  <button
                    key={k}
                    className={`btn ${risk === k ? "btn-primary" : ""}`}
                    onClick={() => {
                      setRisk(k);
                      setInp((x) => ({ ...x, annualReturn: RISK_LEVELS[k].r, annualVol: RISK_LEVELS[k].vol }));
                    }}
                  >
                    {k}
                  </button>
                ))}
              </div>
              {showHelp && <div className="text-xs opacity-70 mt-2">Conservador = más estable; Agresivo = más subidas y bajadas. Puedes cambiarlo cuando quieras.</div>}

              <div className="grid sm:grid-cols-3 gap-3 mt-4">
                <label className="text-sm">
                  Retorno anual esperado
                  <input
                    type="number"
                    step={0.01}
                    className="input mt-1"
                    value={inp.annualReturn}
                    onChange={(e) => setInp({ ...inp, annualReturn: Number(e.target.value) })}
                  />
                  {showHelp && <div className="text-[11px] opacity-70 mt-1">Ej. 0.12 = 12% anual promedio, no garantizado.</div>}
                </label>
                <label className="text-sm">
                  Volatilidad anual
                  <input
                    type="number"
                    step={0.01}
                    className="input mt-1"
                    value={inp.annualVol}
                    onChange={(e) => setInp({ ...inp, annualVol: Number(e.target.value) })}
                  />
                  {showHelp && <div className="text-[11px] opacity-70 mt-1">Qué tanto sube y baja cada año. Más volatilidad = resultados más impredecibles.</div>}
                </label>
                <label className="text-sm">
                  Comisión anual (TER)
                  <input
                    type="number"
                    step={0.001}
                    className="input mt-1"
                    value={inp.annualFee}
                    onChange={(e) => setInp({ ...inp, annualFee: Number(e.target.value) })}
                  />
                  {showHelp && <div className="text-[11px] opacity-70 mt-1">Lo que pagas al año por el producto (ej. 0.01 = 1%).</div>}
                </label>
              </div>

              {/* Cuestionario opcional */}
              <div className="mt-4">
                <button className="btn btn-ghost text-sm" onClick={() => setRqOpen((v) => !v)}>
                  {rqOpen ? "Ocultar" : "Calcular mi perfil"}
                </button>
                {rqOpen && (
                  <div className="mt-3 grid sm:grid-cols-2 gap-3">
                    <label className="text-sm">
                      Edad
                      <input type="number" className="input mt-1" min={18} max={99} value={rq.age} onChange={(e) => setRq({ ...rq, age: Number(e.target.value) })} />
                    </label>
                    <label className="text-sm">
                      Estabilidad de ingresos
                      <select className="input mt-1" value={rq.incomeStability} onChange={(e) => setRq({ ...rq, incomeStability: e.target.value as RiskInputs["incomeStability"] })}>
                        <option value="low">Baja</option>
                        <option value="medium">Media</option>
                        <option value="high">Alta</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      Experiencia
                      <select className="input mt-1" value={rq.experience} onChange={(e) => setRq({ ...rq, experience: e.target.value as RiskInputs["experience"] })}>
                        <option value="none">Ninguna</option>
                        <option value="basic">Básica</option>
                        <option value="intermediate">Intermedia</option>
                        <option value="advanced">Avanzada</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      Tolerancia a caídas
                      <select className="input mt-1" value={rq.maxDrawdownTolerance} onChange={(e) => setRq({ ...rq, maxDrawdownTolerance: e.target.value as RiskInputs["maxDrawdownTolerance"] })}>
                        <option value="10">10%</option>
                        <option value="20">20%</option>
                        <option value="35">35%</option>
                        <option value="50">50%</option>
                      </select>
                    </label>
                    <div className="sm:col-span-2 flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                      <div>
                        <div className="text-sm font-medium">Perfil sugerido: {rqResult.profile}</div>
                        <div className="text-[11px] opacity-70">{rqResult.rationale}</div>
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          setRisk(rqResult.profile);
                          const lvl = RISK_LEVELS[rqResult.profile];
                          setInp((x) => ({ ...x, annualReturn: lvl.r, annualVol: lvl.vol }));
                        }}
                      >
                        Usar perfil
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Paso opcional: Traer de tu feed IA */}
            <div className="card p-5" id="feed-panel">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm opacity-80">Opcional: inspírate con tu feed diario (no anualizable)</div>
                <div className="flex items-center gap-2">
                  <select className="input text-sm w-auto" value={symbol} onChange={(e) => setSymbol(e.target.value as (typeof SYMBOLS)[number])}>
                    {SYMBOLS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button className="btn" onClick={() => loadFeedForSymbol(symbol)} disabled={feedLoading}>Cargar</button>
                </div>
              </div>
              {feedErr && <div className="text-xs text-rose-300">{feedErr}</div>}
              {feedLoading && <div className="text-xs opacity-70">Cargando ideas…</div>}
              {feedList && feedList.length === 0 && <div className="text-xs opacity-70">No hay ideas para {symbol} ahora.</div>}
              {feedList && feedList.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm block">
                    Elige una idea
                    <select
                      className="input mt-1"
                      value={feedChoice ?? ''}
                      onChange={(e) => setFeedChoice(e.target.value)}
                    >
                      {feedList.map((it, idx) => (
                        <option key={idx} value={`${symbol}|${idx}`}>
                          {it.symbol} • {String(it.horizon ?? '1d')} • {it.action} • conf {Math.round((it.p_conf ?? 0)*100)}%
                        </option>
                      ))}
                    </select>
                  </label>
                  {(() => {
                    if (!feedChoice) return null;
                    const idx = Number(feedChoice.split('|')[1]);
                    const it = feedList[idx];
                    const derived = it ? expFromFeed(it) : null;
                    if (!it || !derived) return null;
                    const rPct = nf(derived.rAnnual * 100, 0, 1);
                    const vPct = nf(derived.volAnnual * 100, 0, 1);
                    return (
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-center justify-between">
                        <div className="text-sm">
                          <div><span className="opacity-70">Retorno anual (derivado):</span> <span className="font-semibold">{rPct}%</span></div>
                          <div><span className="opacity-70">Volatilidad anual (derivada):</span> <span className="font-semibold">{vPct}%</span></div>
                        </div>
                        <button
                          className="btn btn-primary"
                          onClick={() => setInp((x) => ({ ...x, annualReturn: derived.rAnnual, annualVol: derived.volAnnual }))}
                        >
                          Aplicar al simulador
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
              {showHelp && (
                <div className="text-[11px] opacity-70 mt-2">Tomamos la idea (dirección/confianza/stops/sigma) y la convertimos en retorno y volatilidad anual aproximados para fines educativos.</div>
              )}
            </div>

            {/* Resultados con lenguaje natural */}
            <div className="card p-5" id="sim-results">
              <div className="flex items-center justify-between mb-2"><div className="text-sm opacity-80">Tu escenario simulado</div><ResultsInfoPopover /></div>
              {!out ? (
                <div className="text-sm opacity-70">Ajusta los controles para ver resultados.</div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm">
                    Si inviertes hoy {money(inp.initial)} y aportas {money(inp.monthly)} cada mes durante {Math.round(inp.months / 12)} años, en un escenario típico podrías terminar con <span className="font-semibold">{money(out.p50)}</span> ({nf(roiMedian, 0, 1)}%).
                  </div>
                  <div className="text-sm opacity-90">En un escenario malo (5%) ≈ {money(out.p5)}. En uno optimista (95%) ≈ {money(out.p95)}.</div>
                  <div className="text-sm opacity-90">Probabilidad de terminar en pérdida: <span className="font-semibold">{nf(out.probLoss * 100, 0, 1)}%</span>.</div>
                  <div className="text-sm opacity-90">Caída máxima estimada en un camino típico: <span className="font-semibold">{nf(out.maxDD_median * 100, 0, 1)}%</span>.</div>
                  <PBar p5={out.p5} p50={out.p50} p95={out.p95} />
                </div>
              )}
            </div>

            {showHelp && (
              <div className="card p-5">
                <div className="text-sm font-medium mb-2">Glosario rápido</div>
                <ul className="text-sm space-y-1 opacity-90 list-disc pl-5">
                  <li>Retorno esperado: promedio anual que podrías ganar. No es una promesa.</li>
                  <li>Volatilidad: cuánto puede subir y bajar. Más volatilidad = resultados más variados.</li>
                  <li>Horizonte: tiempo que mantienes la inversión. Plazos largos suelen ayudar.</li>
                  <li>Drawdown: caída desde un pico al siguiente valle. Mide “golpes” en el camino.</li>
                </ul>
              </div>
            )}
          </div>

          {/* Lado derecho: mercado en vivo y contexto */}
          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm opacity-80">Mercado en vivo</div>
                <button className="btn btn-primary" onClick={() => { setQuery(symbol); setShowSearch(true); }}>Buscar símbolo</button>
              </div>
              <RightChart symbol={symbol} />
              {showHelp && (
                <div className="text-[11px] opacity-70 mt-2">
                  Consejito: mirar el gráfico ayuda a entender que los precios suben y bajan. Eso es normal.
                </div>
              )}
            </div>

            <div className="text-[11px] opacity-70">
              Este simulador es educativo. No constituye asesoría financiera.
            </div>
          </div>
        </section>
      </div>
      {/* Overlay de búsqueda centrado */}
      {showSearch && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSearch(false)} />
          <div className="absolute inset-0 flex items-start sm:items-center justify-center p-4 sm:p-6">
            <div className="card w-full max-w-xl p-4">
              <div className="text-sm opacity-75 mb-2">Buscar símbolo</div>
              <input
                autoFocus
                className="input w-full"
                placeholder="Escribe un símbolo (ej. BTC-USD, AAPL, EURUSD=X)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const q = query.trim().toUpperCase();
                    const matches = (SEARCH_LIST as readonly string[]).filter(s => s.includes(q));
                    const pick = (matches[0] ?? q);
                    setSymbol(pick);
                    setQuery(pick);
                    setShowSearch(false);
                  } else if (e.key === 'Escape') {
                    setShowSearch(false);
                  }
                }}
              />
              <div className="mt-2 max-h-72 overflow-auto">
                {(() => {
                  const q = query.trim().toUpperCase();
                  const matches = (SEARCH_LIST as readonly string[]).filter(s => s.includes(q));
                  return matches.length === 0 ? (
                    <div className="text-sm opacity-60 px-1 py-2">Sin coincidencias</div>
                  ) : (
                    matches.map((s) => (
                      <button
                        key={s}
                        className={`w-full text-left px-3 py-2 rounded hover:bg-white/10 ${s===symbol? 'bg-white/5':''}`}
                        onClick={() => { setSymbol(s); setQuery(s); setShowSearch(false); }}
                      >
                        <span className="inline-flex items-center gap-2">
                          <SymbolAvatar symbol={s} size={18} />
                          <AssetHover symbol={s}><span>{s}</span></AssetHover>
                        </span>
                      </button>
                    ))
                  );
                })()}
              </div>
              <div className="flex items-center justify-between mt-3 text-xs opacity-60">
                <span>Enter: seleccionar</span>
                <span>Esc: cerrar</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tourOpen && (
        <TourModalV2
          onClose={() => setTourOpen(false)}
          symbol={symbol}
          months={inp.months}
          style={risk}
          onOpenIdeas={() => setIdeasOpen(true)}
        />
      )}

      {ideasOpen && (
        <FeedIdeasOverlay
          symbol={symbol}
          months={inp.months}
          style={risk}
          onApply={(ret, vol) => { setInp((x) => ({ ...x, annualReturn: ret, annualVol: vol })); setIdeasOpen(false); setTimeout(() => { try { document.getElementById('sim-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {} }, 50); }}
          onClose={() => setIdeasOpen(false)}
        />
      )}
    </main>
  );
}

function RightChart({ symbol }: { symbol: string }) {
  const [last, setLast] = useState<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [label, setLabel] = useState<import("@/components/MarketChartE").RangeBtn>("MAX");
  return (
    <div>
      <div className="mb-2">
        <div className="flex items-center gap-2">
          <PriceTicker price={last} deltaPct={delta ?? null} symbol={symbol} symbolMode="plain" />
          <AssetHover symbol={symbol}><span className="info-badge">i</span></AssetHover>
        </div>
      </div>
      <MarketChartE
          symbol={symbol}
          tf="5m"
          height={360}
          onPrice={setLast}
          onRangeDelta={(d, r) => { setDelta(d); setLabel(r); }}
          showLastPrice
        />
      {delta != null && (
        <div className="mt-2 text-xs opacity-80">Variación acumulada ({label}): {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(2)}%</div>
      )}
    </div>
  );
}

function ResultsInfoPopover() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className="chip" onClick={() => setOpen((v) => !v)} title="¿Cómo leer esto?">i</button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 p-3 rounded-xl border border-white/10 bg-white/10 backdrop-blur">
          <div className="text-sm font-medium mb-1">Cómo interpretar</div>
          <ul className="text-[12px] opacity-90 space-y-1 list-disc pl-4">
            <li><b>P50</b> es el “típico”: la mitad de los escenarios termina por encima y la otra mitad por debajo.</li>
            <li><b>P5</b> y <b>P95</b> te muestran un rango plausible: malo vs optimista.</li>
            <li><b>Prob. de pérdida</b> estima qué tan posible es terminar por debajo de lo invertido.</li>
            <li><b>Drawdown</b> es la máxima caída en el camino: prepara tu paciencia.</li>
          </ul>
          <div className="text-xs opacity-80 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 mt-2">
            Importante: tu modelo predice el proximo cierre (senal diaria). Para simular a largo plazo, usa supuestos propios
            (retorno y volatilidad) por historia/research; no anualices la senal diaria.
          </div>
          <div className="text-xs opacity-80 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 mt-2">
            Importante: tu modelo predice el proximo cierre (senal diaria). Para simular a largo plazo, usa supuestos propios
            (retorno y volatilidad) por historia/research; no anualices la senal diaria.
          </div>
          <div className="mt-2 text-[11px] opacity-70">Es una simulación educativa, no un pronóstico certero.</div>
        </div>
      )}
    </div>
  );
}

function FeedIdeasOverlay({ symbol, months, style, onApply, onClose }: { symbol: string; months: number; style: RiskProfile; onApply: (ret: number, vol: number) => void; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [list, setList] = useState<FeedItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true); setErr(null);
        const items = await getFeed({ symbol });
        if (alive) setList(items);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [symbol]);

  const top3 = useMemo(() => {
    const arr = (list ?? []).filter(it => it.action !== 'ABSTAIN');
    const scored = arr.map(it => ({ it, d: tourDeriveFromFeed(it), s: tourScoreIdea(it, Math.max(1, Math.round(months/12)), style) }))
                      .filter(x => x.d)
                      .sort((a,b) => b.s - a.s)
                      .slice(0,3);
    return scored as Array<{ it: FeedItem; d: { muA: number; sigA: number }; s: number }>;
  }, [list, months, style]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 flex items-start sm:items-center justify-center p-4 sm:p-6">
        <div className="card w-full max-w-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm opacity-80">Mejores ideas del feed para {symbol}</div>
            <button className="btn" onClick={onClose}>Cerrar</button>
          </div>
          {err && <div className="text-rose-300 text-xs mb-2">{err}</div>}
          {loading && <div className="text-xs opacity-70">Cargando…</div>}
          {!loading && top3.length === 0 && <div className="text-xs opacity-70">Sin ideas para este símbolo ahora.</div>}
          <div className="space-y-2">
            {top3.map(({ it, d }, idx) => (
              <div key={idx} className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{it.symbol} • {it.action} • conf {Math.round((it.p_conf ?? 0)*100)}% • {String(it.horizon ?? '1d')}</div>
                  <div className="text-[11px] opacity-80">Ret anual: {(d.muA*100).toFixed(1)}% • Vol anual: {(d.sigA*100).toFixed(1)}%</div>
                </div>
                <div className="text-[11px] opacity-60 italic mr-3">Heurística para simulación. No proviene del modelo diario.</div>
                <button className="btn btn-primary" onClick={() => onApply(d.muA, d.sigA)}>Aplicar</button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3 text-xs opacity-70">
            <span>Ordenadas por confianza, riesgo/beneficio y recencia.</span>
            <a href="/feed" className="link">Ver feed</a>
          </div>
        </div>
      </div>
    </div>
  );
}
// Nueva versión del tour con slide de selección IA
function TourModalV2({
  onClose,
  symbol,
  months,
  style,
  onOpenIdeas,
  onApplyDerived,
}: {
  onClose: () => void;
  symbol: string;
  months: number;
  style: RiskProfile;
  onOpenIdeas: () => void;
  onApplyDerived?: (ret: number, vol: number) => void;
}) {
  const [i, setI] = useState(0);

  const [fLoading, setFLoading] = useState(false);
  const [fErr, setFErr] = useState<string | null>(null);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [actionF, setActionF] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [minConf, setMinConf] = useState<number>(0.6);

  const loadIdeas = async () => {
    try {
      setFErr(null); setFLoading(true);
      const arr = await getFeed({ symbol });
      setItems(arr);
    } catch (e) {
      setFErr(e instanceof Error ? e.message : String(e));
      setItems(null);
    } finally {
      setFLoading(false);
    }
  };

  const derived = useMemo(() => {
    const src = (items ?? []).filter(it => it.action !== "ABSTAIN");
    const f1 = actionF === "ALL" ? src : src.filter(it => it.action === actionF);
    const f2 = f1.filter(it => (it.p_conf ?? 0) >= minConf);
    const mapped = f2.map(it => {
      const d = tourDeriveFromFeed(it);
      const score = d ? tourScoreIdea(it, Math.max(1, Math.round(months / 12)), style) : -1;
      return { it, d, score } as const;
    }).filter(x => x.d != null);
    mapped.sort((a, b) => b.score - a.score);
    return mapped.slice(0, 6);
  }, [items, actionF, minConf, months, style]);


  const slides: Array<{ title: string; body: ReactNode; cta?: ReactNode }> = [
    {
      title: "Qué es este simulador",
      body: (
        <div className="space-y-2 text-sm">
          <p>
            Es una simulación por escenarios. No intenta adivinar el precio exacto del futuro, sino dibujar un rango de resultados posibles usando dos ideas simples:
            <span className="font-medium"> retorno esperado</span> (promedio anual) y <span className="font-medium">volatilidad</span> (qué tanto sube y baja en el camino).
          </p>
          <p>
            Con esto generamos muchos caminos hipotéticos y te mostramos tres referencias: escenario malo (5%), típico (mediana) y optimista (95%).
          </p>
        </div>
      ),
    },
    {
      title: "Cómo configurarlo",
      body: (
        <ul className="text-sm space-y-1 list-disc pl-5">
          <li><span className="font-medium">Monto inicial</span>: lo que inviertes hoy.</li>
          <li><span className="font-medium">Aporte mensual</span>: lo que sumas cada mes. El hábito importa.</li>
          <li><span className="font-medium">Horizonte</span>: meses que planeas mantener la inversión.</li>
          <li><span className="font-medium">Estilo (riesgo)</span>: Conservador/Moderado/Agresivo ajustan retorno/volatilidad.</li>
          <li><span className="font-medium">Comisión (TER)</span>: costo anual del producto.</li>
        </ul>
      ),
    },
    {
      title: "Qué significa el resultado",
      body: (
        <div className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Mediana (P50)</span>: el escenario &quot;típico&quot;. <span className="font-medium">P5</span>: peor 5% de casos. <span className="font-medium">P95</span>: mejor 5%.
          </p>
          <p>
            <span className="font-medium">Probabilidad de pérdida</span>: fracción de escenarios que terminan por debajo de lo invertido. <span className="font-medium">Drawdown</span>: caída máxima en un camino típico.
          </p>
          <p className="text-[11px] opacity-70">Nota: es una herramienta educativa, no una promesa de resultados.</p>
        </div>
      ),
    },
    {
      title: "Úsalo junto a tu Feed IA",
      body: (
        <div className="space-y-2 text-sm">
          <p>Tu feed con IA genera señáles y pronósticos. Para aprovecharlo aquí:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Si tu modelo estima un <span className="font-medium">retorno anual</span> para un activo/portafolio, úsalo como &quot;Retorno esperado&quot;.</li>
            <li>Si entrega <span className="font-medium">confianza/incertidumbre</span>, tradúcelo a &quot;Volatilidad&quot;: más incertidumbre ? mayor volatilidad.</li>
            <li>Ajusta el <span className="font-medium">horizonte</span> al plazo del pronóstico (ej.: 12 meses).</li>
            <li>Compara un caso base vs. un caso con IA (solo cambiando retorno/volatilidad).</li>
          </ul>
          <p className="text-[11px] opacity-70">Tip: piensa en rangos de resultados, no certezas únicas.</p>
        </div>
      ),
      cta: (
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn btn-primary" onClick={() => { onOpenIdeas(); onClose(); }} title="Elegir entre las mejores ideas de tu feed">
            Aplicar ejemplo IA
          </button>
          <a href="/feed" className="btn" title="Abrir tu feed de ideas">Ir al feed</a>
        </div>
      ),
    },
    {
      title: "Elige una opción del feed",
      body: (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="opacity-80">Símbolo: <span className="font-semibold">{symbol}</span></div>
            <div className="flex items-center gap-2">
              <select className="input text-xs w-auto" value={actionF} onChange={(e) => setActionF(e.target.value as "ALL"|"BUY"|"SELL")}>
                <option value="ALL">Todas</option>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
              <label className="text-xs opacity-80 flex items-center gap-2">
                Conf {Math.round(minConf * 100)}%
                <input type="range" min={0} max={100} value={Math.round(minConf * 100)} onChange={(e) => setMinConf(Number(e.target.value)/100)} />
              </label>
            </div>
          </div>
          {fErr && <div className="text-rose-300 text-xs">{fErr}</div>}
          {fLoading && <div className="opacity-70 text-xs">Cargando ideas.</div>}
          {!fLoading && (!items || items.length === 0) && (
            <button className="btn" onClick={loadIdeas}>Cargar ideas</button>
          )}
          {derived.length > 0 && (
            <div className="space-y-2">
              {derived.map(({ it, d }, idx) => (
                <div key={idx} className="rounded-lg border border-white/10 bg-white/5 p-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{it.symbol}  {it.action}  conf {Math.round((it.p_conf ?? 0)*100)}%  {String(it.horizon ?? '1d')}</div>
                     <div className="text-[11px] opacity-80">Ret heuristico anual (simulacion): {(d!.muA*100).toFixed(1)}%  Vol heuristica anual (simulacion): {(d!.sigA*100).toFixed(1)}%</div>
                     <div className="text-[11px] opacity-60 italic">Heuristica derivada para simulacion; no proviene del modelo diario.</div>
                  </div>
                  <button className="btn btn-primary" onClick={() => { if (onApplyDerived) { onApplyDerived(d!.muA, d!.sigA); } onClose(); setTimeout(() => { try { document.getElementById('sim-results')?.scrollIntoView({ behavior:'smooth', block:'start' }); } catch {} }, 50); }}>
                    Aplicar
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="text-[11px] opacity-70">Ordenadas por confianza, riesgo/beneficio, recencia y afinidad a tu horizonte/estilo.</div>
        </div>
      ),
      cta: (
        <div className="flex items-center gap-2">
          <button className="btn" onClick={() => setI(3)}>Volver</button>
          <a href="/feed" className="link text-sm">Ver tu feed</a>
        </div>
      ),
    },
  ];

  const last = Math.min(slides.length - 1, 3);
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-4 sm:inset-x-auto sm:right-8 top-12 sm:top-16">
        <div className="card p-5 w-full sm:w-[560px]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm opacity-80">Tour Simulador</div>
              <h3 className="text-lg font-semibold">{slides[i].title}</h3>
            </div>
            <button className="btn" onClick={onClose} aria-label="Cerrar">Cerrar</button>
          </div>
          <div className="mt-3">{slides[i].body}</div>
          {slides[i].cta && <div className="mt-3">{slides[i].cta}</div>}
          <div className="mt-5 flex items-center justify-between">
            <button className="btn btn-ghost" onClick={onClose}>Saltar</button>
            <div className="flex items-center gap-2">
              <button className="btn" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>Atrás</button>
              {i < last ? (
                <button className="btn btn-primary" onClick={() => setI((x) => Math.min(last, x + 1))}>Siguiente</button>
              ) : (
                <button className="btn btn-primary" onClick={onClose}>Entendido</button>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-1 justify-center">
            {slides.map((_, idx) => (
              <div key={idx} className={`h-1.5 w-6 rounded ${idx === i ? "bg-primary" : "bg-white/15"}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
/*
function TourModal({ onClose, onApplyExample, onUseBestFromFeed, onOpenFeedPicker }: { onClose: () => void; onApplyExample: (ret: number, vol: number) => void; onUseBestFromFeed: () => void; onOpenFeedPicker: () => void }) {
  const slides: Array<{ title: string; body: ReactNode; cta?: ReactNode }> = [
    {
      title: "Qué es este simulador",
      body: (
        <div className="space-y-2 text-sm">
          <p>
            Es una simulación por escenarios. No intenta adivinar el precio exacto del futuro, sino dibujar un rango de resultados posibles usando dos ideas simples:
            <span className="font-medium"> retorno esperado</span> (promedio anual) y <span className="font-medium">volatilidad</span> (qué tanto sube y baja en el camino).
          </p>
          <p>
            Con esto generamos muchos caminos hipotéticos y te mostramos tres referencias: escenario malo (5%), típico (mediana) y optimista (95%).
          </p>
        </div>
      ),
    },
    {
      title: "Cómo configurarlo",
      body: (
        <ul className="text-sm space-y-1 list-disc pl-5">
          <li><span className="font-medium">Monto inicial</span>: lo que inviertes hoy.</li>
          <li><span className="font-medium">Aporte mensual</span>: lo que sumas cada mes. El hábito importa.</li>
          <li><span className="font-medium">Horizonte</span>: meses que planeas mantener la inversión.</li>
          <li><span className="font-medium">Estilo (riesgo)</span>: Conservador/Moderado/Agresivo ajustan retorno/volatilidad.</li>
          <li><span className="font-medium">Comisión (TER)</span>: costo anual del producto.</li>
        </ul>
      ),
    },
    {
      title: "Qué significa el resultado",
      body: (
        <div className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Mediana (P50)</span>: el escenario “típico”. <span className="font-medium">P5</span>: peor 5% de casos. <span className="font-medium">P95</span>: mejor 5%.
          </p>
          <p>
            <span className="font-medium">Probabilidad de pérdida</span>: fracción de escenarios que terminan por debajo de lo invertido. <span className="font-medium">Drawdown</span>: caída máxima en un camino típico.
          </p>
          <p className="text-[11px] opacity-70">Nota: es una herramienta educativa, no una promesa de resultados.</p>
        </div>
      ),
    },
    {
      title: "Úsalo junto a tu Feed IA",
      body: (
        <div className="space-y-2 text-sm">
          <p>Tu feed con IA genera señales y pronósticos. Para aprovecharlo aquí:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Si tu modelo estima un <span className="font-medium">retorno anual</span> para un activo/portafolio, úsalo como “Retorno esperado”.</li>
            <li>Si entrega <span className="font-medium">confianza/incertidumbre</span>, tradúcelo a “Volatilidad”: más incertidumbre ⇒ mayor volatilidad.</li>
            <li>Ajusta el <span className="font-medium">horizonte</span> al plazo del pronóstico (ej.: 12 meses).</li>
            <li>Compara un caso base vs. un caso con IA (solo cambiando retorno/volatilidad).</li>
          </ul>
          <p className="text-[11px] opacity-70">Tip: piensa en rangos de resultados, no certezas únicas.</p>
        </div>
      ),
      cta: (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="btn btn-primary"
            onClick={() => { onApplyExample(0.12, 0.22); onClose(); setTimeout(() => { try { document.getElementById('sim-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {} }, 50); }}
            title="Aplica un ejemplo de retorno/volatilidad inspirado en un pronóstico de 12 meses"
          >
            Aplicar ejemplo IA
          </button>
          <button className="btn" onClick={() => { onUseBestFromFeed(); }} title="Usar la idea de mayor confianza de tu feed para el símbolo actual">
            Mejor idea del feed
          </button>
          <button className="btn" onClick={() => { onOpenFeedPicker(); }} title="Elegir manualmente una idea desde tu feed">
            Elegir idea del feed
          </button>
          <a href="/feed" className="link text-sm">Ver tu feed</a>
        </div>
      ),
    },
  ];

  const [i, setI] = useState(0);
  const last = slides.length - 1;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-4 sm:inset-x-auto sm:right-8 top-12 sm:top-16">
        <div className="card p-5 w-full sm:w-[560px]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm opacity-80">Tour • Simulador</div>
              <h3 className="text-lg font-semibold">{slides[i].title}</h3>
            </div>
            <button className="btn" onClick={onClose} aria-label="Cerrar">Cerrar</button>
          </div>
          <div className="mt-3">{slides[i].body}</div>
          {slides[i].cta && <div className="mt-3">{slides[i].cta}</div>}
          <div className="mt-5 flex items-center justify-between">
            <button className="btn btn-ghost" onClick={onClose}>Saltar</button>
            <div className="flex items-center gap-2">
              <button className="btn" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>Atrás</button>
              {i < last ? (
                <button className="btn btn-primary" onClick={() => setI((x) => Math.min(last, x + 1))}>Siguiente</button>
              ) : (
                <button className="btn btn-primary" onClick={onClose}>Entendido</button>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-1 justify-center">
            {slides.map((_, idx) => (
              <div key={idx} className={`h-1.5 w-6 rounded ${idx === i ? "bg-primary" : "bg-white/15"}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
*/

