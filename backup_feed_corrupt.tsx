"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import SymbolAvatar from "@/components/SymbolAvatar";
import AssetHover from "@/components/AssetHover";
import { getFeed, type FeedItem } from "@/lib/api.feed";
import { loadRiskProfile } from "@/lib/invest";
import { classifySymbol, type AssetClass } from "@/lib/market";

type Horizon = "1d" | "3d" | "5d" | "10d";
type ActionFilter = "ALL" | "BUY" | "SELL" | "HOLD" | "ABSTAIN";
type SortKey = "conf" | "date";
type FilterState = {
  horizon: Horizon;
  minConf: number;
  action: ActionFilter;
  classFilter: AssetClass | "all";
  q: string;
  sort: SortKey;
  onlyStops: boolean;
};

type Counts = Record<FeedItem["action"], number>;

type MiniStat = { label: string; value: string; hint?: string };

const HORIZON_OPTIONS: Horizon[] = ["1d", "3d", "5d", "10d"];
const HORIZON_LABEL: Record<Horizon, string> = {
  "1d": "Pr\u00F3ximo cierre (1 d\u00EDa)",
  "3d": "Pr\u00F3ximos 3 d\u00EDas",
  "5d": "Pr\u00F3ximos 5 d\u00EDas",
  "10d": "Pr\u00F3ximos 10 d\u00EDas",
};

const PROFILE_PRESETS: Record<string, { horizon: Horizon; minConf: number }> = {
  Conservador: { horizon: "1d", minConf: 0.65 },
  Moderado: { horizon: "5d", minConf: 0.6 },
  Agresivo: { horizon: "3d", minConf: 0.55 },
};

const REFRESH_MS = 90_000;
const FEED_LIMIT = 400;

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function actionLabel(a: FeedItem["action"]) {
  if (a === "BUY") return "Sube";
  if (a === "SELL") return "Baja";
  if (a === "HOLD") return "En espera";
  if (a === "ABSTAIN") return "Sin se\u00F1al clara";
  return a;
}

function friendlyHorizonLabel(value?: string | null) {
  if (!value) return "Horizonte sin definir";
  const lower = value.toLowerCase();
  if (lower in HORIZON_LABEL) {
    return HORIZON_LABEL[lower as Horizon];
  }
  const match = /^(\d+)d$/.exec(lower);
  if (match) {
    const count = Number(match[1]);
    if (Number.isFinite(count)) {
      return count === 1 ? "Pr\u00F3ximo cierre (1 d\u00EDa)" : `Pr\u00F3ximos ${count} d\u00EDas`;
    }
  }
  return `Horizonte ${value}`;
}

function fmtNumber(value?: number | null, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString("es-MX", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPercent(value?: number | null, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const scaled = Math.abs(value) <= 1 ? value * 100 : value;
  return `${scaled.toFixed(digits)}%`;
}

function fmtText(value?: string | null) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return "-";
}

function pct(a?: number, b?: number) {
  if (a == null || b == null || b === 0) return null;
  return (a / b - 1) * 100;
}

function toFilters(params: URLSearchParams, fallback: FilterState): FilterState {
  const horizonParam = params.get("h") ?? params.get("horizon");
  const parsedHorizon = HORIZON_OPTIONS.includes((horizonParam as Horizon) ?? "")
    ? (horizonParam as Horizon)
    : fallback.horizon;

  const minParam = params.get("m") ?? params.get("min_conf");
  const parsedMin = (() => {
    if (!minParam) return fallback.minConf;
    const numeric = Number(minParam);
    if (!Number.isFinite(numeric)) return fallback.minConf;
    return minParam.includes(".") ? Math.min(1, Math.max(0, numeric)) : Math.min(1, Math.max(0, numeric / 100));
  })();

  const parsedAction = ((): ActionFilter => {
    const candidate = params.get("a") as ActionFilter | null;
    return candidate && ["ALL", "BUY", "SELL", "HOLD", "ABSTAIN"].includes(candidate) ? candidate : fallback.action;
  })();

  const parsedSort = ((): SortKey => {
    const candidate = params.get("s") as SortKey | null;
    return candidate && ["conf", "date"].includes(candidate) ? candidate : fallback.sort;
  })();

  const parsedClass = ((): AssetClass | "all" => {
    const candidate = params.get("cls") as AssetClass | "all" | null;
    return candidate && ["all", "crypto", "equity", "etf", "forex", "index", "other"].includes(candidate)
      ? candidate
      : fallback.classFilter;
  })();

  return {
    horizon: parsedHorizon,
    minConf: parsedMin,
    action: parsedAction,
    sort: parsedSort,
    classFilter: parsedClass,
    q: params.get("q") ?? fallback.q,
    onlyStops: params.get("stops") === "1",
  };
}

function filtersToSearch(filters: FilterState): URLSearchParams {
  const qs = new URLSearchParams();
  qs.set("h", filters.horizon);
  qs.set("m", String(Math.round(filters.minConf * 100)));
  qs.set("a", filters.action);
  qs.set("s", filters.sort);
  qs.set("cls", filters.classFilter);
  if (filters.q) qs.set("q", filters.q); else qs.delete("q");
  qs.set("stops", filters.onlyStops ? "1" : "0");
  return qs;
}

function buildMiniStats(item: FeedItem): MiniStat[] {
  return [
    { label: "Último cierre", value: fmtNumber(item.last_close, 2) },
    { label: "Meta", value: fmtNumber(item.stops?.tp, 2) },
    { label: "Piso", value: fmtNumber(item.stops?.sl, 2) },
    { label: "Prob. suba", value: fmtPercent(item.p_up, 1) },
  ];
}

function FeedCard({ item, activeHorizon }: { item: FeedItem; activeHorizon: Horizon }) {
  const confidence = Math.round((item.p_conf ?? 0) * 100);
  const horizonLabel = friendlyHorizonLabel(item.horizon ?? activeHorizon);
  const stops = item.stops && typeof item.stops.tp === "number" && typeof item.stops.sl === "number";
  const gainPct = pct(item.stops?.tp, item.last_close);
  const lossPct = pct(item.stops?.sl, item.last_close);

  const statPairs = buildMiniStats(item);
  const assetClass = classifySymbol(item.symbol);

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.05] transition">
      <div className="flex flex-col gap-4 p-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <SymbolAvatar symbol={item.symbol} size={36} />
            <div className="leading-tight">
              <Link href={`/asset/${item.symbol}`} className="font-semibold hover:underline transition">
                <AssetHover symbol={item.symbol}>{item.symbol}</AssetHover>
              </Link>
              <div className="text-xs opacity-70">{horizonLabel}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white/10">
              <span className="font-semibold tracking-wide">{actionLabel(item.action)}</span>
              <span className="opacity-70">{confidence}%</span>
            </span>
            <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">
              {assetClass === "crypto"
                ? "Cripto"
                : assetClass === "equity"
                  ? "Acción"
                  : assetClass === "etf"
                    ? "ETF"
                    : assetClass === "forex"
                      ? "Forex"
                      : assetClass === "index"
                        ? "Índice"
                        : "Otro"}
            </span>
          </div>
        </header>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          {stops ? (
            <>
              <div>
                <span className="opacity-70">Meta de ganancia: </span>
                {fmtNumber(item.stops!.tp, 3)}
                {gainPct != null ? <span className="opacity-60"> ({fmtPercent(gainPct, 2)})</span> : null}
              </div>
              <div>
                <span className="opacity-70">Piso de protección: </span>
                {fmtNumber(item.stops!.sl, 3)}
                {lossPct != null ? <span className="opacity-60"> ({fmtPercent(lossPct, 2)})</span> : null}
              </div>
            </>
          ) : (
            <div className="sm:col-span-2 text-xs opacity-70">
              Sin metas de ganancia ni piso de protección sugeridos.
            </div>
          )}
          <div className="sm:col-span-2 flex flex-wrap gap-3 text-xs">
            {statPairs.map(({ label, value }) => (
              <span key={label} className="px-2 py-1 rounded bg-white/5 border border-white/10">
                <span className="opacity-70 mr-1">{label}:</span>
                <span className="font-medium">{value}</span>
              </span>
            ))}
          </div>
        </div>

        {item.hold_reason ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs leading-relaxed">
            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">Motivo de espera</div>
            <div className="mt-1 whitespace-pre-wrap opacity-80">{item.hold_reason}</div>
          </div>
        ) : null}
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
    </div>
  );
}
function computeCounts(items: FeedItem[]): Counts {
  const base: Counts = { BUY: 0, SELL: 0, HOLD: 0, ABSTAIN: 0 };
  for (const item of items) base[item.action] = (base[item.action] ?? 0) + 1;
  return base;
}

const DEFAULT_FILTERS: FilterState = {
  horizon: "1d",
  minConf: 0.6,
  action: "ALL",
  classFilter: "all",
  q: "",
  sort: "conf",
  onlyStops: false,
};

function FeedInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<FilterState>(() => toFilters(searchParams, DEFAULT_FILTERS));
  const filtersRef = useRef(filters);
  const [data, setData] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const didApplyPreset = useRef(false);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    if (didApplyPreset.current) return;
    const profile = loadRiskProfile()?.profile;
    const preset = profile ? PROFILE_PRESETS[profile] : null;
    if (preset) {
      setFilters((prev) => ({ ...prev, ...preset }));
    }
    didApplyPreset.current = true;
  }, []);

  useEffect(() => {
    const qs = filtersToSearch(filters);
    router.replace(`${pathname}?${qs.toString()}`);
  }, [filters, pathname, router]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      const qs = new URLSearchParams();
      qs.set("limit", String(FEED_LIMIT));
      qs.set("min_conf", "0");
      qs.set("horizon", filters.horizon);
      try {
        const payload = await getFeed(qs);
        if (cancelled) return;
        setData(Array.isArray(payload) ? payload : []);
        setUpdatedAt(new Date());
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setData([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filters.horizon, tick]);

  const filtered = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const q = filters.q.trim().toLowerCase();
    return data
      .filter((item) => {
        const passConf = (item.p_conf ?? 0) >= filters.minConf;
        const passAction = filters.action === "ALL" ? true : item.action === filters.action;
        const passStops = filters.onlyStops
          ? !!(item.stops && typeof item.stops.tp === "number" && typeof item.stops.sl === "number")
          : true;
        const passQuery = q ? item.symbol.toLowerCase().includes(q) : true;
        const passClass = filters.classFilter === "all" ? true : classifySymbol(item.symbol) === filters.classFilter;
        return passConf && passAction && passStops && passQuery && passClass;
      })
      .sort((a, b) => {
        if (filters.sort === "conf") return (b.p_conf ?? 0) - (a.p_conf ?? 0);
        if (filters.sort === "date") return new Date(b.ts ?? 0).getTime() - new Date(a.ts ?? 0).getTime();
        return 0;
      });
  }, [data, filters]);

  const counts = useMemo(() => computeCounts(filtered), [filtered]);

  function exportCSV() {
    const periodo = friendlyHorizonLabel(filters.horizon);
    const headers = [
      "symbol",
      "accion",
      "certeza",
      "periodo",
      "fecha",
      "precio",
      "meta_ganancia",
      "piso_proteccion",
    ] as const;

    const rows = filtered.map((item) => ({
      symbol: item.symbol,
      accion: actionLabel(item.action),
      certeza: Math.round((item.p_conf ?? 0) * 100),
      periodo,
      fecha: item.ts ?? "",
      precio: item.last_close ?? "",
      meta_ganancia: item.stops?.tp ?? "",
      piso_proteccion: item.stops?.sl ?? "",
    }));

    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((key) => String(row[key] ?? "")).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aura_feed_${filters.horizon}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (error) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">
            <div className="font-semibold mb-1">No pudimos cargar tus ideas</div>
            <div className="text-sm opacity-90">{error}</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-5">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Recomendaciones para ti</h1>
          <p className="text-sm opacity-70">Ideas simples según tu perfil, listas para accionar.</p>
          <div className="text-xs opacity-70">
            Mostrando {filtered.length} de {Array.isArray(data) ? data.length : 0} ideas · {friendlyHorizonLabel(filters.horizon)}
          </div>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm opacity-80">Periodo</label>
            <select
              value={filters.horizon}
              onChange={(event) => setFilters((prev) => ({ ...prev, horizon: event.target.value as Horizon }))}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm"
            >
              {HORIZON_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {HORIZON_LABEL[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-56">
            <label className="flex items-center justify-between text-sm opacity-80">
              <span>Nivel de certeza mínimo</span>
              <span className="font-medium">{Math.round(filters.minConf * 100)}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(filters.minConf * 100)}
              onChange={(event) => setFilters((prev) => ({ ...prev, minConf: Number(event.target.value) / 100 }))}
              className="w-full accent-emerald-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm opacity-80">Tipo</span>
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {(["ALL", "BUY", "SELL", "HOLD", "ABSTAIN"] as ActionFilter[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setFilters((prev) => ({ ...prev, action: value }))}
                  className={cn(
                    "px-2 py-1 text-xs border-r border-white/10 last:border-r-0",
                    value === filters.action ? "bg-white/15" : "bg-white/5 hover:bg-white/10",
                  )}
                >
                  {value === "ALL" ? "Todas" : actionLabel(value)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm opacity-80">Ordenar por</span>
            <select
              value={filters.sort}
              onChange={(event) => setFilters((prev) => ({ ...prev, sort: event.target.value as SortKey }))}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm"
            >
              <option value="conf">Mayor certeza</option>
              <option value="date">Más recientes</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm opacity-80">Clase</span>
            <select
              value={filters.classFilter}
              onChange={(event) => setFilters((prev) => ({ ...prev, classFilter: event.target.value as AssetClass | "all" }))}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm"
            >
              <option value="all">Todas</option>
              <option value="crypto">Cripto</option>
              <option value="equity">Acciones</option>
              <option value="etf">ETF</option>
              <option value="forex">Forex</option>
              <option value="index">Índices</option>
              <option value="other">Otros</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm opacity-90">
            <input
              type="checkbox"
              className="accent-emerald-400"
              checked={filters.onlyStops}
              onChange={(event) => setFilters((prev) => ({ ...prev, onlyStops: event.target.checked }))}
            />
            Mostrar solo con protecciones
          </label>

          <div className="flex items-center gap-2">
            <input
              placeholder="Buscar símbolo…"
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                const profile = loadRiskProfile()?.profile;
                const preset = profile ? PROFILE_PRESETS[profile] : null;
                setFilters({ ...DEFAULT_FILTERS, ...(preset ?? {}) });
              }}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-sm"
            >
              Usar mi perfil
            </button>
            <button
              onClick={() => setTick((t) => t + 1)}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-sm"
            >
              Refrescar
            </button>
            <button
              onClick={exportCSV}
              className="px-3 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm"
            >
              Exportar CSV
            </button>
          </div>
        </section>

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
          {updatedAt ? (
            <span className="ml-auto text-xs opacity-70">
              Última actualización: {updatedAt.toLocaleTimeString()}
            </span>
          ) : null}
        </section>

        <section className="grid gap-4">
          {isLoading && (!data || data.length === 0) ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : filtered.length > 0 ? (
            filtered.map((item) => (
              <FeedCard key={`${item.symbol}-${item.ts ?? ""}`} item={item} activeHorizon={filters.horizon} />
            ))
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm opacity-80 mb-2">No hay ideas con el nivel de certeza elegido.</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilters((prev) => ({ ...prev, minConf: Math.max(0, prev.minConf - 0.05) }))}
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-sm"
                >
                  Bajar 5%
                </button>
                <button
                  onClick={() => setFilters((prev) => ({ ...prev, minConf: 0 }))}
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
