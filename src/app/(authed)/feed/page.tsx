"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import SymbolAvatar from "@/components/SymbolAvatar";
import AssetHover from "@/components/AssetHover";
import { getFeed, type FeedItem } from "@/lib/api.feed";
import { loadRiskProfile } from "@/lib/invest";
import { classifySymbol, type AssetClass, getSessionInfo } from "@/lib/market";

type Horizon = "1d" | "1w";
type ActionFilter = "ALL" | "BUY" | "SELL" | "HOLD" | "ABSTAIN";
type SortKey = "conf" | "date";

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
  const styles =
    action === "BUY"
      ? "text-emerald-300 ring-emerald-500/30 bg-emerald-500/10"
      : action === "SELL"
      ? "text-rose-300 ring-rose-500/30 bg-rose-500/10"
      : action === "ABSTAIN"
      ? "text-amber-300 ring-amber-500/30 bg-amber-500/10"
      : "text-slate-300 ring-slate-500/30 bg-slate-500/10";
  const explain = action === "BUY"
    ? "Sube: mayor probabilidad de cierre al alza."
    : action === "SELL"
      ? "Baja: mayor probabilidad de cierre a la baja."
      : action === "HOLD"
        ? "En espera: no hay ventaja clara para operar."
        : "Sin señal clara: información insuficiente o incertidumbre alta.";
  return (
    <span className="tooltip">
      <span
        className={cn(
          "px-2 py-0.5 rounded-full text-xs font-semibold tracking-wide ring-1 shadow-sm backdrop-blur",
          styles,
        )}
      >
        {actionLabel(action)}
      </span>
      <div role="tooltip" className="tooltip-panel"><div className="tooltip-title">¿Qué significa?</div><div className="tooltip-text">{explain}</div></div>
    </span>
  );
}

function pct(a?: number, b?: number) {
  if (a == null || b == null || b === 0) return null;
  return (a / b - 1) * 100;
}

// ===== Helpers para derivar retorno/vol desde el feed (módulo) =====
function ppy(h?: string): number {
  if (!h) return 12;
  if (h === "1d") return 252;
  if (h === "1w") return 52;
  if (h === "1h") return 252 * 6; // aprox sesiones
  if (typeof h === "string" && h.endsWith("m")) {
    const m = Number(h.replace("m", ""));
    return m > 0 ? (12 * 60) / m : 12;
  }
  return 12;
}
function annualize(mu_h: number, n: number) { return Math.pow(1 + mu_h, Math.max(1, n)) - 1; }
function annualizeVol(s_h: number, n: number) { return s_h * Math.sqrt(Math.max(1, n)); }
export function deriveFromFeed(item: FeedItem): { muA: number; sigA: number } | null {
  const conf = typeof item.p_conf === "number" ? Math.max(0, Math.min(1, item.p_conf)) : 0.5;
  const n = ppy(item.horizon as string | undefined);
  const px = item.last_close ?? null;
  let mu_h = 0; let sig_h: number | null = null;
  if (typeof item.sigma === "number" && isFinite(item.sigma)) sig_h = Math.max(0, item.sigma);
  if (px && item.stops && typeof item.stops.tp === "number" && typeof item.stops.sl === "number") {
    const rTp = item.stops.tp / px - 1; const rSl = item.stops.sl / px - 1;
    if (item.action === "BUY") mu_h = conf * rTp + (1 - conf) * rSl;
    else if (item.action === "SELL") mu_h = conf * (-Math.abs(rSl)) + (1 - conf) * Math.abs(rTp);
    else mu_h = conf * rTp + (1 - conf) * rSl;
    if (sig_h == null) sig_h = (Math.abs(rTp) + Math.abs(rSl)) / 2;
  } else {
    const base = 0.01; // heurística educativa
    if (item.action === "BUY") mu_h = conf * base;
    else if (item.action === "SELL") mu_h = -conf * base;
    else mu_h = 0;
    if (sig_h == null) sig_h = 0.02;
  }
  return { muA: annualize(mu_h, n), sigA: annualizeVol(sig_h ?? 0.02, n) };
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
    return c === 'crypto' ? 'Cripto' : c === 'equity' ? 'Acción' : c === 'etf' ? 'ETF' : c === 'forex' ? 'Forex' : c === 'index' ? 'Índice' : 'Otro';
  }, [item.symbol]);

  return (
    <article className={cn(
      "rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
      "shadow-lg shadow-black/30 transition-colors duration-200 transform-gpu hover:-translate-y-0.5 fade-in-up"
    )}>
      <div className="p-5">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold tracking-wide">
              <Link href={`/asset/${item.symbol}`} className="hover:underline flex items-center gap-2">
                <SymbolAvatar symbol={item.symbol} size={20} />
                <AssetHover symbol={item.symbol}><span>{item.symbol}</span></AssetHover>
              </Link>
            </h3>
            <div className="flex items-center gap-2">
              <ActionBadge action={item.action} />
              <span className="chip">{classLabel}</span>
              {session && (
                session.is24x7 ? (
                  <span className="chip">24/7</span>
                ) : (
                  <span className="chip">{session.isOpen ? 'Abierto' : 'Cerrado'} · {session.isOpen ? (session.nextCloseLocal ? `cierra ${session.nextCloseLocal}` : '') : (session.nextOpenLocal ? `abre ${session.nextOpenLocal}` : '')}</span>
                )
              )}
            </div>
          </div>
          <time className="text-xs opacity-70">{safeDate}</time>
        </header>

        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div>
            <span className="opacity-70">Periodo: </span>
            Próximo cierre (1 día)
          </div>
          {hasStops ? (
            <>
              <div>
                <span className="opacity-70">Meta de ganancia: </span>
                {item.stops!.tp.toFixed(4)}
                {rTp != null ? <span className="opacity-60"> ({rTp.toFixed(2)}%)</span> : null}
              </div>
              <div>
                <span className="opacity-70">Piso de protección: </span>
                {item.stops!.sl.toFixed(4)}
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
              La señal aún no es clara.
            </div>
          ) : null}
        </div>

        {/* Nivel de certeza */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="opacity-70 tooltip">Nivel de certeza
              <span className="tooltip-panel"><div className="tooltip-title">¿Qué es?</div><div className="tooltip-text">Probabilidad central de que el próximo cierre suba. 50% es neutro.</div></span>
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
          <div className="mt-1 text-[11px] opacity-70">Referencia: 50% ≈ neutral, valores altos = mayor confianza.</div>
        </div>

        {derived && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3 text-xs">
            <div className="opacity-80">
              <div>Retorno anual derivado: <span className="font-semibold">{(derived.muA * 100).toFixed(1)}%</span></div>
              <div>Volatilidad anual derivada: <span className="font-semibold">{(derived.sigA * 100).toFixed(1)}%</span></div>
            </div>
            <Link
              href={`/simulator?symbol=${encodeURIComponent(item.symbol)}&mu=${(derived.muA).toFixed(6)}&sigma=${(derived.sigA).toFixed(6)}&months=12`}
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

  const [horizon, setHorizon] = useState<Horizon>("1d");
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
    const h =
      (searchParams.get("h") as Horizon | null) ??
      (searchParams.get("horizon") as Horizon | null);
    const m = searchParams.get("m") ?? searchParams.get("min_conf");
    const a = searchParams.get("a") as ActionFilter | null;
    const s = searchParams.get("s") as SortKey | null;
    const qq = searchParams.get("q");
    const os = searchParams.get("stops");

    if (h) setHorizon(h);
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
    else if (prof === "Agresivo") { setHorizon("1d"); setMinConf(0.55); }
    else { setHorizon("1d"); setMinConf(0.60); } // Moderado/por defecto

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
      const passConf = (d.p_conf ?? 0) >= minConf;
      const passAct = action === "ALL" ? true : d.action === action;
      const passStops = onlyStops
        ? !!(d.stops && typeof d.stops.tp === "number" && typeof d.stops.sl === "number")
        : true;
      const passQ = q ? d.symbol.toLowerCase().includes(q.toLowerCase()) : true;
      const passClass = classFilter === 'all' ? true : classifySymbol(d.symbol) === classFilter;
      return passConf && passAct && passStops && passQ && passClass;
    });
    const sorted = [...f].sort((a, b) => {
      if (sort === "conf") return (b.p_conf ?? 0) - (a.p_conf ?? 0);
      if (sort === "date")
        return new Date(b.ts ?? 0).getTime() - new Date(a.ts ?? 0).getTime();
      return 0;
    });
    return sorted;
  }, [data, minConf, action, onlyStops, q, sort, classFilter]);

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
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm opacity-80">Periodo</label>
            <select
              value={horizon}
              onChange={(e) => setHorizon(e.target.value as Horizon)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm"
            >
              <option value="1d">Próximos días</option>
              <option value="1w">Próximas semanas</option>
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
                else if (prof === "Agresivo") { setHorizon("1w"); setMinConf(0.55); }
                else { setHorizon("1d"); setMinConf(0.60); }
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
        <section className="grid gap-4">
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
