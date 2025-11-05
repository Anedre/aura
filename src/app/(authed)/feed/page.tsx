"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import SymbolAvatar from "@/components/SymbolAvatar";
import AssetHover from "@/components/AssetHover";
import { getFeed, type FeedItem } from "@/lib/api.feed";
import { deriveFromFeed } from "@/lib/feed-derive";
import { loadRiskProfile } from "@/lib/invest";
import { classifySymbol, type AssetClass, getSessionInfo } from "@/lib/market";

const HORIZON_OPTIONS = ["1d", "3d", "5d", "10d"] as const;
const DEFAULT_HORIZON = HORIZON_OPTIONS[0];
type Horizon = (typeof HORIZON_OPTIONS)[number];
type ActionFilter = "ALL" | "BUY" | "SELL" | "HOLD" | "ABSTAIN";
type SortKey = "conf" | "date";

function coerceHorizon(value: string | null | undefined): Horizon {
  if (!value) return DEFAULT_HORIZON;
  const normalized = value.trim().toLowerCase();
  for (const option of HORIZON_OPTIONS) {
    if (option === normalized) {
      return option;
    }
  }
  return DEFAULT_HORIZON;
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function actionLabel(a: FeedItem["action"]) {
  if (a === "BUY") return "Sube";
  if (a === "SELL") return "Baja";
  if (a === "HOLD") return "En espera";
  if (a === "ABSTAIN") return "Sin señal clara";
  return a;
}

function ActionBadge({ action }: { action: FeedItem["action"] }) {
  const badgeClasses =
    action === "BUY"
      ? "text-emerald-300 ring-emerald-500/30 bg-emerald-500/10"
      : action === "SELL"
        ? "text-rose-300 ring-rose-500/30 bg-rose-500/10"
        : action === "ABSTAIN"
          ? "text-amber-300 ring-amber-500/30 bg-amber-500/10"
          : "text-slate-300 ring-slate-500/30 bg-slate-500/10";
  const explanation =
    action === "BUY"
      ? "Sube: el modelo detecta una oportunidad de compra para este periodo."
      : action === "SELL"
        ? "Baja: el modelo identifica presión bajista y sugiere reducir o vender."
        : action === "HOLD"
          ? "En espera: la señal es neutra, conviene observar sin entrar todavía."
          : "Sin señal clara: la incertidumbre es alta; espera nuevos datos para decidir.";
  return (
    <span className="tooltip">
      <span
        className={cn(
          "px-2 py-0.5 rounded-full text-xs font-semibold tracking-wide ring-1 shadow-sm backdrop-blur",
          badgeClasses,
        )}
      >
        {actionLabel(action)}
      </span>
      <div role="tooltip" className="tooltip-panel">
        <div className="tooltip-title">¿Qué significa?</div>
        <div className="tooltip-text">{explanation}</div>
      </div>
    </span>
  );
}
function pct(a?: number, b?: number) {
  if (a == null || b == null || b === 0) return null;
  return (a / b - 1) * 100;
}

const ACTION_THEME: Record<FeedItem["action"], { card: string; chip: string; text: string }> = {
  BUY: {
    card: "border-emerald-400/40 bg-emerald-500/5",
    chip: "bg-emerald-500/15 text-emerald-200",
    text: "text-emerald-100",
  },
  SELL: {
    card: "border-rose-400/40 bg-rose-500/5",
    chip: "bg-rose-500/15 text-rose-200",
    text: "text-rose-100",
  },
  HOLD: {
    card: "border-slate-400/40 bg-slate-500/5",
    chip: "bg-slate-500/15 text-slate-200",
    text: "text-slate-100",
  },
  ABSTAIN: {
    card: "border-amber-400/40 bg-amber-500/5",
    chip: "bg-amber-500/15 text-amber-100",
    text: "text-amber-100",
  },
};

function formatHorizonLabel(value?: string | null): string {
  if (!value) return "Próximo cierre (1 día)";
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Próximo cierre (1 día)";
  const lower = trimmed.toLowerCase();
  const direct: Record<string, string> = {
    "1d": "Próximo cierre (1 día)",
    "3d": "Próximos 3 días",
    "5d": "Próximos 5 días",
    "10d": "Próximos 10 días",
    "1w": "Próximas semanas",
    "1h": "Próxima hora",
  };
  if (direct[lower]) return direct[lower];
  const match = /^([0-9]+)([a-z]+)$/.exec(lower);
  if (match) {
    const amount = Number(match[1]);
    const unit = match[2];
    if (Number.isFinite(amount)) {
      if (unit === "d") return amount === 1 ? "Próximo cierre (1 día)" : `Próximos ${amount} días`;
      if (unit === "w") return amount === 1 ? "Próxima semana" : `Próximas ${amount} semanas`;
      if (unit === "h") return amount === 1 ? "Próxima hora" : `Próximas ${amount} horas`;
    }
  }
  return `Horizonte ${trimmed}`;
}

function humanizeReason(reason?: string | null): string | null {
  if (!reason) return null;
  const cleaned = reason.toString().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function fmtNumber(value?: number | null, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString("es-MX", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function buildActionExplanation(item: FeedItem, horizonLabel: string, confidencePct: number): string {
  const confidenceText = confidencePct > 0 ? `${confidencePct}%` : "un nivel moderado";
  const reasonText = humanizeReason(item.hold_reason ?? item.abstain_reason ?? null);
  const stopsText = item.stops && typeof item.stops.tp === "number" && typeof item.stops.sl === "number"
    ? `Sugiere tomar utilidades cerca de ${fmtNumber(item.stops.tp, 2)} y proteger la operación si llega a ${fmtNumber(item.stops.sl, 2)}.`
    : null;

  if (item.action === "BUY") {
    return [
      `El modelo estima ${confidenceText} de probabilidad de que el precio suba en ${horizonLabel}, por eso recomienda comprar.`,
      stopsText ?? "Considera definir tus propios niveles de salida antes de entrar.",
    ].join(" ");
  }

  if (item.action === "SELL") {
    return [
      `El modelo detecta presión bajista para ${item.symbol}: calcula ${confidenceText} de probabilidad de que el precio caiga en ${horizonLabel}, por lo que sugiere vender o cubrir la posición.`,
      stopsText ?? "Si ya tienes el activo, puedes fijar tus propios niveles de salida para limitar la pérdida.",
    ].join(" ");
  }

  if (item.action === "HOLD") {
    const neutral = `La probabilidad de subir o bajar está muy pareja (aprox. ${confidenceText}), así que conviene esperar una señal más clara en ${horizonLabel}.`;
    const extra = reasonText ? `Motivo adicional del modelo: ${reasonText}.` : "Usa este tiempo para revisar tu plan o seguir monitorizando el mercado.";
    return `${neutral} ${extra}`;
  }

  const uncertain = `La señal para ${item.symbol} es incierta: los datos actuales no permiten una decisión confiable para ${horizonLabel}.`;
  const extra = reasonText ? `Motivo detectado: ${reasonText}.` : "Lo ideal es esperar nueva información antes de operar.";
  return `${uncertain} ${extra}`;
}

function Card({ item }: { item: FeedItem }) {
  const confPct = Math.round((item.p_conf ?? 0) * 100);
  const ts = item.ts ? new Date(item.ts) : new Date();
  const safeDate = ts.toLocaleString();

  const hasStops = !!item.stops && typeof item.stops.tp === "number" && typeof item.stops.sl === "number";
  const rTp = pct(item.stops?.tp, item.last_close);
  const rSl = pct(item.stops?.sl, item.last_close);

  const derived = useMemo(() => deriveFromFeed(item), [item]);
  const session = useMemo(() => getSessionInfo(item.symbol), [item.symbol]);
  const classLabel = useMemo(() => {
    const c = classifySymbol(item.symbol);
    return c === "crypto"
      ? "Cripto"
      : c === "equity"
        ? "Acción"
        : c === "etf"
          ? "ETF"
          : c === "forex"
            ? "Forex"
            : c === "index"
              ? "Índice"
              : "Otro";
  }, [item.symbol]);

  const sessionChip = session
    ? (() => {
        if (session.is24x7) return "24/7";
        const parts: string[] = [session.isOpen ? "Abierto" : "Cerrado"];
        const next = session.isOpen ? session.nextCloseLocal : session.nextOpenLocal;
        if (next) {
          parts.push(`${session.isOpen ? "cierra" : "abre"} ${next}`);
        }
        return parts.join(" · ");
      })()
    : null;

  const theme = ACTION_THEME[item.action];
  const horizonLabel = formatHorizonLabel(item.horizon);
  const explanation = buildActionExplanation(item, horizonLabel, confPct);

  return (
    <article
      className={cn(
        "rounded-2xl border shadow-lg shadow-black/30 transition-colors duration-200 transform-gpu hover:-translate-y-0.5 fade-in-up backdrop-blur",
        theme.card,
      )}
    >
      <div className="p-5">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold tracking-wide">
              <Link href={`/asset/${item.symbol}`} className="hover:underline flex items-center gap-2">
                <SymbolAvatar symbol={item.symbol} size={20} />
                <AssetHover symbol={item.symbol}>
                  <span>{item.symbol}</span>
                </AssetHover>
              </Link>
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <ActionBadge action={item.action} />
              <span className={cn("chip", theme.chip)}>{classLabel}</span>
              {sessionChip ? <span className="chip">{sessionChip}</span> : null}
            </div>
          </div>
          <time className="text-xs opacity-70">{safeDate}</time>
        </header>

        <p className={cn("text-sm leading-relaxed mt-3", theme.text)}>{explanation}</p>

        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div>
            <span className="opacity-70">Periodo: </span>
            {horizonLabel}
          </div>
          {hasStops ? (
            <>
              <div>
                <span className="opacity-70">Meta de ganancia: </span>
                {fmtNumber(item.stops!.tp, 4)}
                {rTp != null ? <span className="opacity-60"> ({rTp.toFixed(2)}%)</span> : null}
              </div>
              <div>
                <span className="opacity-70">Piso de protección: </span>
                {fmtNumber(item.stops!.sl, 4)}
                {rSl != null ? <span className="opacity-60"> ({rSl.toFixed(2)}%)</span> : null}
              </div>
            </>
          ) : (
            <div className="col-span-2 text-xs opacity-70">
              Sin metas de ganancia ni piso de protección sugeridos.
            </div>
          )}

          {item.action === "ABSTAIN" ? (
            <div className="col-span-2 text-amber-300/90 text-xs">
              La señal aún no es clara; espera más información.
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="opacity-70 tooltip">
              Nivel de certeza
              <span className="tooltip-panel">
                <div className="tooltip-title">¿Qué es?</div>
                <div className="tooltip-text">
                  Probabilidad central de que el próximo cierre suba. 50% es neutro.
                </div>
              </span>
            </span>
            <span className="font-medium">{confPct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full progress-smooth",
                item.action === "BUY"
                  ? "bg-emerald-500"
                  : item.action === "SELL"
                    ? "bg-rose-500"
                    : item.action === "ABSTAIN"
                      ? "bg-amber-500"
                      : "bg-slate-500",
              )}
              style={{ width: `${confPct}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] opacity-70">
            Referencia: 50% es neutral, valores altos implican más confianza.
          </div>
        </div>

        {derived && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-white/10 bg-white/5 p-3 text-xs">
            <div className="opacity-80">
              <div>
                Retorno anual derivado: {" "}
                <span className="font-semibold">{(derived.muA * 100).toFixed(1)}%</span>
              </div>
              <div>
                Volatilidad anual derivada: {" "}
                <span className="font-semibold">{(derived.sigA * 100).toFixed(1)}%</span>
              </div>
            </div>
            <Link
              href={`/simulator?symbol=${encodeURIComponent(item.symbol)}&mu=${derived.muA.toFixed(6)}&sigma=${derived.sigA.toFixed(6)}&months=12`}
              className="btn btn-primary"
              title="Abrir el simulador con estos parámetros"
            >
              Simular con IA
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 animate-pulse">
      <div className="h-4 w-24 bg-white/10 rounded" />
      <div className="mt-2 h-5 w-16 bg-white/10 rounded" />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="h-4 bg-white/10 rounded" />
        <div className="h-4 bg-white/10 rounded" />
        <div className="h-4 bg-white/10 rounded" />
        <div className="h-4 bg-white/10 rounded" />
      </div>
      <div className="mt-4 h-1.5 bg-white/10 rounded" />
    </div>
  );
}

function FeedInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [data, setData] = useState<FeedItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [horizon, setHorizon] = useState<Horizon>(DEFAULT_HORIZON);
  const [minConf, setMinConf] = useState<number>(0.60); // valor amigable por defecto
  const [action, setAction] = useState<ActionFilter>("ALL");
  const [q, setQ] = useState<string>("");
  const [classFilter, setClassFilter] = useState<AssetClass | 'all'>('all');
  const [sort, setSort] = useState<SortKey>("conf");
  const [onlyStops, setOnlyStops] = useState(false);
  const [tick, setTick] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const initDone = useRef(false);

  // 1) Inicializa desde URL (si hay)
  useEffect(() => {
    const rawH = searchParams.get("h") ?? searchParams.get("horizon");
    const m = searchParams.get("m") ?? searchParams.get("min_conf");
    const a = searchParams.get("a") as ActionFilter | null;
    const s = searchParams.get("s") as SortKey | null;
    const qq = searchParams.get("q");
    const os = searchParams.get("stops");

    if (rawH) setHorizon(coerceHorizon(rawH));
    if (m) setMinConf(Number(m) / (m.includes(".") ? 1 : 100));
    if (a) setAction(a);
    if (s) setSort(s);
    if (qq) setQ(qq);
    if (os) setOnlyStops(os === "1");
    // no marcamos initDone aquí: dejamos que el próximo effect decida defaults si no había URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Si NO había parámetros en la URL, aplica defaults según perfil
  useEffect(() => {
    if (initDone.current) return;
    const noParams =
      !searchParams.get("h") &&
      !searchParams.get("horizon") &&
      !searchParams.get("m") &&
      !searchParams.get("min_conf");
    if (!noParams) { initDone.current = true; return; }

    const prof = loadRiskProfile()?.profile;
    if (prof === "Conservador") { setHorizon("1d"); setMinConf(0.65); }
    else if (prof === "Agresivo") { setHorizon("5d"); setMinConf(0.55); }
    else { setHorizon("3d"); setMinConf(0.60); } // Moderado/por defecto

    initDone.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escribe filtros a URL
  useEffect(() => {
    const qsp = new URLSearchParams(searchParams);
    qsp.set("h", horizon);
    qsp.set("m", String(Math.round(minConf * 100)));
    qsp.set("a", action);
    qsp.set("s", sort);
    if (q) qsp.set("q", q); else qsp.delete("q");
    qsp.set("cls", classFilter);
    qsp.set("stops", onlyStops ? "1" : "0");
    router.replace(`${pathname}?${qsp.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizon, minConf, action, sort, q, onlyStops, classFilter]);

  // Auto-refresh
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 90_000);
    return () => clearInterval(id);
  }, []);

  // Fetch feed
  useEffect(() => {
    setData(null);
    setErr(null);

    const qs = new URLSearchParams();
    qs.set("horizon", horizon);
    qs.set("min_conf", String(minConf)); // 0..1
    qs.set("limit", "200"); // intenta traer más ideas si el backend lo soporta
    getFeed(qs)
      .then((d) => {
        setData(d);
        setUpdatedAt(new Date());
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }, [horizon, minConf, tick]);

  const filtered: FeedItem[] = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const f = data.filter((d) => {
      const itemHorizon = typeof d.horizon === "string" ? coerceHorizon(d.horizon) : DEFAULT_HORIZON;
      const passConf = (d.p_conf ?? 0) >= minConf;
      const passAct = action === "ALL" ? true : d.action === action;
      const passStops = onlyStops
        ? !!(d.stops && typeof d.stops.tp === "number" && typeof d.stops.sl === "number")
        : true;
      const passQ = q ? d.symbol.toLowerCase().includes(q.toLowerCase()) : true;
      const passClass = classFilter === 'all' ? true : classifySymbol(d.symbol) === classFilter;
      const passHz = itemHorizon === horizon;
      return passConf && passAct && passStops && passQ && passClass && passHz;
    });
    const sorted = [...f].sort((a, b) => {
      if (sort === "conf") return (b.p_conf ?? 0) - (a.p_conf ?? 0);
      if (sort === "date")
        return new Date(b.ts ?? 0).getTime() - new Date(a.ts ?? 0).getTime();
      return 0;
    });
    return sorted;
  }, [data, minConf, action, onlyStops, q, sort, classFilter, horizon]);

  const counts = useMemo(() => {
    const base: Record<FeedItem["action"], number> = { BUY: 0, SELL: 0, ABSTAIN: 0, HOLD: 0 };
    if (!Array.isArray(data)) return base;
    for (const d of data) base[d.action] = (base[d.action] ?? 0) + 1;
    return base;
  }, [data]);

  function exportCSV() {
    const rows = filtered.map((d) => ({
      symbol: d.symbol,
      accion: actionLabel(d.action),
      certeza: Math.round((d.p_conf ?? 0) * 100),
      periodo: "Próximo cierre (1 día)",
      fecha: d.ts ?? "",
      precio: d.last_close ?? "",
      meta_ganancia: d.stops?.tp ?? "",
      piso_proteccion: d.stops?.sl ?? "",
    }));
    const headers = [
      "symbol","accion","certeza","periodo","fecha","precio","meta_ganancia","piso_proteccion",
    ] as const;

    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => String(r[h] ?? "")).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aura_feed_${horizon}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (err) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-5 sm:py-6">
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200">
            <div className="font-semibold mb-1">No pudimos cargar tus ideas</div>
            <div className="text-sm opacity-90">{err}</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-5 sm:py-6 space-y-5 sm:space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Recomendaciones para ti</h1>
          <p className="text-sm opacity-70">
            Ideas simples según tu perfil. Sin complicaciones, con metas claras.
          </p>
          <div className="text-xs opacity-70">Mostrando {Array.isArray(filtered) ? filtered.length : 0} de {Array.isArray(data) ? data.length : 0} ideas</div>
        </header>
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-semibold mb-1">¿Qué significa “nivel de certeza”?</div>
          <p className="text-sm opacity-80">
            Es la probabilidad central de que el <span className="font-medium">próximo cierre</span> suba. Por ejemplo, 60% sugiere que, en contextos parecidos,
            6 de cada 10 veces el precio terminó arriba. No garantiza resultados.
          </p>
        </section>

        {/* FILTROS (claros) */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-wrap items-center gap-4" data-tour="feed-filters">
          <div className="flex items-center gap-2">
            <label className="text-sm opacity-80">Periodo</label>
            <select
              value={horizon}
              onChange={(e) => setHorizon(coerceHorizon(e.target.value))}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm"
            >
              {HORIZON_OPTIONS.map((hz) => (
                <option key={hz} value={hz}>
                  {formatHorizonLabel(hz)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-56">
            <label className="flex items-center justify-between text-sm opacity-80">
              <span>Nivel de certeza mínimo</span>
              <span className="font-medium">{Math.round(minConf * 100)}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(minConf * 100)}
              onChange={(e) => setMinConf(Number(e.target.value) / 100)}
              className="w-full accent-emerald-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm opacity-80">Tipo</span>
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {(["ALL", "BUY", "SELL", "HOLD", "ABSTAIN"] as ActionFilter[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAction(a)}
                  className={cn(
                    "px-2 py-1 text-xs border-r border-white/10 last:border-r-0",
                    a === action ? "bg-white/15" : "bg-white/5 hover:bg-white/10",
                  )}
                  title={a}
                >
                  {a === "ALL" ? "Todas" : actionLabel(a)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm opacity-80">Ordenar por</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm"
            >
              <option value="conf">Mayor certeza</option>
              <option value="date">Más recientes</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm opacity-80">Clase</span>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.currentTarget.value as AssetClass | 'all')}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm"
            >
              <option value="all">Todas</option>
              <option value="crypto">Cripto</option>
              <option value="equity">Acciones</option>
              <option value="etf">ETF</option>
              <option value="forex">Forex</option>
              <option value="index">Índices</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm opacity-90">
            <input
              type="checkbox"
              className="accent-emerald-400"
              checked={onlyStops}
              onChange={(e) => setOnlyStops(e.target.checked)}
            />
            mostrar solo con protecciones
          </label>

          <div className="flex items-center gap-2">
            <input
              placeholder="Buscar símbolo…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                const prof = loadRiskProfile()?.profile;
                if (prof === "Conservador") { setHorizon("1d"); setMinConf(0.65); }
                else if (prof === "Agresivo") { setHorizon("5d"); setMinConf(0.55); }
                else { setHorizon("3d"); setMinConf(0.60); }
                setAction("ALL"); setOnlyStops(false); setQ(""); setSort("conf");
              }}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-sm"
              title="Volver a los valores de tu perfil"
            >
              Usar mi perfil
            </button>

            <button
              onClick={() => setTick((t) => t + 1)}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-sm"
              title="Refrescar ahora"
            >
              Refrescar
            </button>
            <button
              onClick={exportCSV}
              className="px-3 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm"
              title="Exportar CSV de lo filtrado"
            >
              Exportar CSV
            </button>
          </div>
        </section>

        {/* CONTADORES */}
        <section className="flex flex-wrap gap-3 text-xs items-center">
          <span className="px-2 py-0.5 rounded-full ring-1 ring-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            Sube: {counts.BUY}
          </span>
          <span className="px-2 py-0.5 rounded-full ring-1 ring-rose-500/30 bg-rose-500/10 text-rose-300">
            Baja: {counts.SELL}
          </span>
          <span className="px-2 py-0.5 rounded-full ring-1 ring-slate-500/30 bg-slate-500/10 text-slate-300">
            En espera: {counts.HOLD}
          </span>
          <span className="px-2 py-0.5 rounded-full ring-1 ring-amber-500/30 bg-amber-500/10 text-amber-300">
            Sin señal clara: {counts.ABSTAIN}
          </span>

          <span className="ml-2 opacity-70">
            Mostrando: {filtered.length} de {Array.isArray(data) ? data.length : 0}
          </span>

          {updatedAt ? (
            <span className="ml-auto opacity-70">
              Última actualización: {updatedAt.toLocaleTimeString()}
            </span>
          ) : null}
        </section>

        {/* LISTA */}
        <section className="grid gap-4" data-tour="feed-cards">
          {data === null ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : filtered.length > 0 ? (
            filtered.map((d, i) => <Card key={`${d.symbol}-${i}`} item={d} />)
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm opacity-80 mb-2">
                No hay ideas con el nivel de certeza elegido.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setMinConf(0.55)}
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-sm"
                >
                  Bajar a 55%
                </button>
                <button
                  onClick={() => setMinConf(0)}
                  className="px-3 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm"
                >
                  Ver todo
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function FeedPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh bg-background text-foreground">
          <div className="max-w-5xl mx-auto p-6 space-y-6">
            <header className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">Recomendaciones para ti</h1>
              <p className="text-sm opacity-70">Cargando…</p>
            </header>
            <section className="grid gap-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </section>
          </div>
        </main>
      }
    >
      <FeedInner />
    </Suspense>
  );
}
