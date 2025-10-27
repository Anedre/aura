// src/app/(authed)/home/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MarketChartE from "@/components/MarketChartE";
import PriceTicker from "@/components/PriceTicker";
import SymbolAvatar from "@/components/SymbolAvatar";
import AssetHover from "@/components/AssetHover";
import NewsList from "@/components/news/NewsList";
import { getAssetMeta } from "@/lib/assets.meta";
import { loadRiskProfile } from "@/lib/invest";
import { getFeed, type FeedItem } from "@/lib/api.feed";
import { fetchSymbolNews, fetchTopNews, type NewsItem } from "@/lib/api.news";
import { classifySymbol, type AssetClass } from "@/lib/market";

const HORIZON_OPTIONS = ["1d", "1w"] as const;
const CLASS_ORDER: AssetClass[] = ["crypto", "equity", "etf", "forex", "index", "other"];
const MAX_PINNED = 6;

type Horizon = (typeof HORIZON_OPTIONS)[number];
type RangeInfo = { delta: number; label: string };

const CLASS_LABEL: Record<AssetClass | "other", string> = {
  crypto: "Cripto",
  equity: "Acciones",
  etf: "ETF",
  forex: "Forex",
  index: "Índices",
  other: "Otros",
};

function actionLabel(action: FeedItem["action"]): string {
  if (action === "BUY") return "Sube";
  if (action === "SELL") return "Baja";
  if (action === "HOLD") return "En espera";
  return "Sin señal clara";
}

function formatHorizonLabel(value?: string | null): string {
  if (!value) return "Próximo cierre (1 día)";
  const normalized = value.trim().toLowerCase();
  if (normalized === "1d") return "Próximo cierre (1 día)";
  if (normalized === "1w") return "Próximas semanas";
  return `Horizonte ${value}`;
}

function formatNumber(value?: number | null, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function computeProjection(row: FeedItem | null, lastPrice: number | null): number | null {
  if (!row) return null;
  const base = (lastPrice ?? row.last_close) ?? null;
  if (base == null || !Number.isFinite(base)) return null;
  if (row.stops && typeof row.stops.tp === "number" && typeof row.stops.sl === "number") {
    if (row.action === "BUY") return row.stops.tp;
    if (row.action === "SELL") return row.stops.sl;
  }
  const confidence = Math.max(0, Math.min(1, row.p_conf ?? 0.6));
  const direction = row.action === "SELL" ? -1 : row.action === "BUY" ? 1 : 0;
  if (direction === 0) return null;
  const step = 0.01 + confidence * 0.015;
  return base * (1 + direction * step);
}

function normalizeSymbol(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().toUpperCase() || null;
}

export default function HomePage() {
  const router = useRouter();
  const defaults = useMemo(() => {
    const profile = loadRiskProfile()?.profile;
    if (profile === "Conservador") return { horizon: "1d" as Horizon, minConf: 0.65 };
    if (profile === "Agresivo") return { horizon: "1d" as Horizon, minConf: 0.55 };
    return { horizon: "1d" as Horizon, minConf: 0.6 };
  }, []);

  const [horizon, setHorizon] = useState<Horizon>(defaults.horizon);
  const [minConf, setMinConf] = useState<number>(defaults.minConf);
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const focusRef = useRef<string | null>(null);
  const [showHelp, setShowHelp] = useState<boolean>(true);
  const [filterClass, setFilterClass] = useState<AssetClass | "all">("all");
  const [rangeInfo, setRangeInfo] = useState<RangeInfo | null>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);

  const [topNews, setTopNews] = useState<NewsItem[] | null>(null);
  const [topNewsLoading, setTopNewsLoading] = useState<boolean>(false);
  const [topNewsError, setTopNewsError] = useState<string | null>(null);
  const [focusNews, setFocusNews] = useState<NewsItem[] | null>(null);
  const [focusNewsLoading, setFocusNewsLoading] = useState<boolean>(false);
  const [focusNewsError, setFocusNewsError] = useState<string | null>(null);

  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("aura_home_pinned");
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const clean = parsed
            .map((item) => (typeof item === "string" ? item.toUpperCase() : null))
            .filter((item): item is string => !!item);
          if (clean.length > 0) setPinned(clean.slice(0, MAX_PINNED));
        }
      }
      const pref = localStorage.getItem("aura_pref_class");
      if (pref && (pref === "all" || (CLASS_ORDER as Array<string>).includes(pref))) {
        setFilterClass(pref as AssetClass | "all");
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("aura_home_pinned", JSON.stringify(pinned));
    } catch {
      // ignore
    }
  }, [pinned]);

  useEffect(() => {
    try {
      localStorage.setItem("aura_pref_class", filterClass);
    } catch {
      // ignore
    }
  }, [filterClass]);

  useEffect(() => {
    let active = true;
    async function loadFeed() {
      try {
        setIsLoadingFeed(true);
        setError(null);
        const data = await getFeed({ horizon, min_conf: minConf, limit: 200 });
        if (!active) return;
        setFeed(data);
        setUpdatedAt(new Date());
        const currentFocus = focusRef.current;
        const hasFocus = currentFocus && data.some((row) => row.symbol === currentFocus);
        if (!hasFocus) {
          const favorite = (() => {
            try {
              return localStorage.getItem("aura_favorite_asset");
            } catch {
              return null;
            }
          })();
          const candidate =
            data.find((row) => favorite && row.symbol === favorite) ??
            data
              .filter((row) => row.action !== "ABSTAIN")
              .sort((a, b) => (b.p_conf ?? 0) - (a.p_conf ?? 0))[0] ??
            data[0] ??
            null;
          if (candidate) {
            const upper = candidate.symbol.toUpperCase();
            focusRef.current = upper;
            setFocus(upper);
            setPinned((prev) => (prev.includes(upper) ? prev : [upper, ...prev].slice(0, MAX_PINNED)));
          }
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setFeed(null);
      } finally {
        if (active) setIsLoadingFeed(false);
      }
    }
    void loadFeed();
    const id = window.setInterval(loadFeed, 90_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [horizon, minConf]);

  useEffect(() => {
    let active = true;
    async function loadNews() {
      try {
        setTopNewsLoading(true);
        setTopNewsError(null);
        const data = await fetchTopNews(6);
        if (!active) return;
        setTopNews(data);
      } catch (err) {
        if (!active) return;
        setTopNewsError(err instanceof Error ? err.message : String(err));
        setTopNews(null);
      } finally {
        if (active) setTopNewsLoading(false);
      }
    }
    void loadNews();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const symbol = normalizeSymbol(focus);
    if (!symbol) {
      setFocusNews(null);
      setFocusNewsError(null);
      return;
    }
    const symbolKey = symbol;
    const meta = getAssetMeta(symbolKey);
    let active = true;
    async function loadSymbolNews() {
      try {
        setFocusNewsLoading(true);
        setFocusNewsError(null);
        const data = await fetchSymbolNews(symbolKey, { limit: 6, name: meta?.name });
        if (!active) return;
        setFocusNews(data);
      } catch (err) {
        if (!active) return;
        setFocusNewsError(err instanceof Error ? err.message : String(err));
        setFocusNews([]);
      } finally {
        if (active) setFocusNewsLoading(false);
      }
    }
    void loadSymbolNews();
    return () => {
      active = false;
    };
  }, [focus]);

  const assetSymbol = normalizeSymbol(focus);
  const current = useMemo(() => {
    if (!feed || !assetSymbol) return null;
    return feed.find((item) => item.symbol === assetSymbol) ?? null;
  }, [feed, assetSymbol]);

  const selectedMeta = useMemo(() => (assetSymbol ? getAssetMeta(assetSymbol) : null), [assetSymbol]);
  const projection = useMemo(() => computeProjection(current, lastPrice), [current, lastPrice]);
  const horizonReadable = formatHorizonLabel(current?.horizon as string | undefined);
  const confidencePct = current?.p_conf != null ? Math.round(current.p_conf * 100) : null;

  const quickSymbols = useMemo(() => {
    const ordered: string[] = [];
    const seen = new Set<string>();
    if (assetSymbol) {
      ordered.push(assetSymbol);
      seen.add(assetSymbol);
    }
    pinned.forEach((sym) => {
      if (!seen.has(sym)) {
        ordered.push(sym);
        seen.add(sym);
      }
    });
    return ordered;
  }, [assetSymbol, pinned]);

  const quickItems = useMemo(
    () =>
      quickSymbols.map((sym) => ({
        symbol: sym,
        row: feed?.find((item) => item.symbol === sym) ?? null,
      })),
    [quickSymbols, feed],
  );

  const groupedFeed = useMemo(() => {
    if (!feed) return null;
    const items = feed.filter((row) => row.symbol !== assetSymbol);
    const byClass = new Map<AssetClass, FeedItem[]>();
    for (const row of items) {
      const cls = classifySymbol(row.symbol) as AssetClass;
      if (filterClass !== "all" && cls !== filterClass) continue;
      const list = byClass.get(cls) ?? [];
      list.push(row);
      byClass.set(cls, list);
    }
    return CLASS_ORDER.filter((cls) => (byClass.get(cls)?.length ?? 0) > 0).map((cls) => ({
      cls,
      rows: byClass.get(cls) ?? [],
    }));
  }, [feed, assetSymbol, filterClass]);

  const rangeDelta = rangeInfo?.delta ?? null;
  const rangeLabel = rangeInfo?.label ?? "";

  function togglePin(symbol: string) {
    const upper = symbol.toUpperCase();
    setPinned((prev) => (prev.includes(upper) ? prev.filter((item) => item !== upper) : [upper, ...prev].slice(0, MAX_PINNED)));
  }

  function handleSelect(symbol: string) {
    const upper = symbol.toUpperCase();
    focusRef.current = upper;
    setFocus(upper);
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Para ti</h1>
            <p className="text-sm opacity-70">Recomendaciones ordenadas según tu perfil y nivel de certeza.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            <label className="flex items-center gap-2 text-sm">
              <span className="opacity-70">Periodo</span>
              <select
                value={horizon}
                onChange={(event) => setHorizon(event.target.value as Horizon)}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm"
              >
                {HORIZON_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {formatHorizonLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="opacity-70">Certeza mínima</span>
              <input
                type="range"
                min={30}
                max={90}
                value={Math.round(minConf * 100)}
                onChange={(event) => setMinConf(Number(event.target.value) / 100)}
              />
              <span className="font-semibold text-sm">{Math.round(minConf * 100)}%</span>
            </div>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="opacity-70">Clase</span>
              <select
                value={filterClass}
                onChange={(event) => setFilterClass(event.currentTarget.value as AssetClass | "all")}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm"
              >
                <option value="all">Todas</option>
                {CLASS_ORDER.map((cls) => (
                  <option key={cls} value={cls}>
                    {CLASS_LABEL[cls]}
                  </option>
                ))}
              </select>
            </label>
            <button
              className={`btn w-full sm:w-auto ${showHelp ? "btn-primary" : ""}`}
              onClick={() => setShowHelp((value) => !value)}
            >
              {showHelp ? "Modo explicado: ON" : "Modo explicado: OFF"}
            </button>
            <button className="btn w-full sm:w-auto" onClick={() => router.push("/feed")}>Ir al feed completo</button>
          </div>
        </header>

        {quickItems.length > 0 && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">Símbolos destacados</span>
              {pinned.length > 0 && (
                <button
                  className="text-xs text-[--primary] hover:underline"
                  onClick={() => setPinned([])}
                >
                  Limpiar fijados
                </button>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {quickItems.map(({ symbol, row }) => {
                const confidence = row?.p_conf != null ? Math.round(row.p_conf * 100) : null;
                const pinnedNow = pinned.includes(symbol);
                return (
                  <button
                    key={symbol}
                    onClick={() => handleSelect(symbol)}
                    className={`rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:bg-white/10 ${symbol === assetSymbol ? "ring-2 ring-[--primary]" : ""}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <SymbolAvatar symbol={symbol} size={18} />
                        <AssetHover symbol={symbol}>
                          <span className="font-semibold">{symbol}</span>
                        </AssetHover>
                      </div>
                      <span className="chip">{actionLabel(row?.action ?? "HOLD")}</span>
                    </div>
                    <div className="mt-2 text-xs opacity-70 flex items-center gap-2">
                      <span>{formatHorizonLabel(row?.horizon as string | undefined)}</span>
                      {confidence != null && <span>{confidence}% certeza</span>}
                    </div>
                    <PriceTicker
                      symbol={symbol}
                      price={row?.last_close ?? null}
                      deltaPct={symbol === assetSymbol ? rangeDelta : null}
                      className="mt-3 w-full"
                      percentDecimals={2}
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded-full border ${pinnedNow ? "bg-[--primary] text-white border-transparent" : "bg-white/10 border-white/15"}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          togglePin(symbol);
                        }}
                      >
                        {pinnedNow ? "Fijado" : "Fijar"}
                      </span>
                      {symbol === assetSymbol && rangeLabel && (
                        <span className="opacity-70">Rango: {rangeLabel}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {showHelp && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm space-y-3">
            <div className="font-semibold">Cómo usar esta pantalla</div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-white/10 p-3">
                <div className="text-xs opacity-60 mb-1">Paso 1</div>
                Selecciona un símbolo para ver la señal del modelo y su nivel de certeza.
              </div>
              <div className="rounded-lg border border-white/10 p-3">
                <div className="text-xs opacity-60 mb-1">Paso 2</div>
                Revisa el gráfico en vivo y las metas sugeridas antes de entrar al mercado.
              </div>
              <div className="rounded-lg border border-white/10 p-3">
                <div className="text-xs opacity-60 mb-1">Paso 3</div>
                Usa el simulador o fija el activo para darle seguimiento en tu panel.
              </div>
            </div>
          </section>
        )}

        <section className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <div className="card p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xl font-semibold">
                    {assetSymbol ? (
                      <>
                        <SymbolAvatar symbol={assetSymbol} size={20} />
                        <AssetHover symbol={assetSymbol}>
                          <span>{assetSymbol}</span>
                        </AssetHover>
                      </>
                    ) : (
                      <span>Selecciona un activo</span>
                    )}
                  </div>
                  {selectedMeta?.name && (
                    <div className="text-xs opacity-70">{selectedMeta.name}</div>
                  )}
                  {confidencePct != null && (
                    <div className="text-xs opacity-70">Nivel de certeza: {confidencePct}%</div>
                  )}
                  {horizonReadable && (
                    <div className="text-xs opacity-70">Horizonte: {horizonReadable}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {assetSymbol && (
                    <button
                      className={`btn ${pinned.includes(assetSymbol) ? "btn-primary" : ""}`}
                      onClick={() => togglePin(assetSymbol)}
                    >
                      {pinned.includes(assetSymbol) ? "Fijado" : "Fijar"}
                    </button>
                  )}
                </div>
              </div>
              {assetSymbol ? (
                <>
                  <PriceTicker
                    symbol={assetSymbol}
                    price={current?.last_close ?? null}
                    deltaPct={rangeDelta}
                    className="w-full"
                  />
                  <MarketChartE
                    symbol={assetSymbol}
                    tf="5m"
                    height={440}
                    baseline={projection}
                    showLastPrice
                    onPrice={setLastPrice}
                    onRangeDelta={(delta: number, label: string) => setRangeInfo({ delta, label })}
                  />
                  {projection != null && (
                    <div className="text-xs opacity-70">
                      Línea punteada: objetivo estimado por el modelo ({formatNumber(projection, 2)}).
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                  Selecciona un símbolo de la lista inferior para ver su gráfico y señal detallada.
                </div>
              )}
            </div>
          </div>
          <aside className="space-y-3">
            <div className="card p-4 space-y-3">
              <div className="text-sm opacity-80">Acciones rápidas</div>
              <div className="flex flex-wrap gap-2 text-sm">
                <button className="btn" onClick={() => router.push("/simulator")}>Probar inversión</button>
                <button className="btn" onClick={() => router.push("/invest/request")}>Solicitar predicción</button>
                <button className="btn" onClick={() => router.push("/profile")}>Mi perfil</button>
              </div>
            </div>
            <div className="card p-4 text-xs opacity-70">
              {updatedAt ? `Última actualización: ${updatedAt.toLocaleTimeString()}` : "Cargando datos..."}
            </div>
          </aside>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="card p-4">
            <NewsList
              title={assetSymbol ? `Noticias sobre ${assetSymbol}` : "Noticias del símbolo"}
              items={assetSymbol ? focusNews : []}
              loading={focusNewsLoading}
              error={focusNewsError}
              emptyMessage={assetSymbol ? "Sin titulares recientes para este activo." : "Selecciona un símbolo para ver titulares relacionados."}
              highlightSymbols={assetSymbol ? [assetSymbol] : undefined}
            />
          </div>
          <div className="card p-4">
            <NewsList
              title="Noticias destacadas del mercado"
              items={topNews}
              loading={topNewsLoading}
              error={topNewsError}
              emptyMessage="Sin titulares relevantes en las últimas horas."
            />
          </div>
        </section>

        <section className="space-y-5">
          {error && (
            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200">{error}</div>
          )}
          {!error && isLoadingFeed && !feed && (
            <div className="grid gap-3">
              <div className="card p-4 h-24 animate-pulse" />
              <div className="card p-4 h-24 animate-pulse" />
              <div className="card p-4 h-24 animate-pulse" />
            </div>
          )}
          {groupedFeed && groupedFeed.map(({ cls, rows }) => (
            <div key={cls} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="text-sm uppercase tracking-wide opacity-70">{CLASS_LABEL[cls]}</div>
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {rows.map((row) => {
                  const confidence = row.p_conf != null ? Math.round(row.p_conf * 100) : null;
                  const pinnedNow = pinned.includes(row.symbol);
                  return (
                    <button
                      key={row.symbol}
                      className={`card p-4 text-left transition hover:bg-white/10 ${row.symbol === assetSymbol ? "ring-2 ring-[--primary]" : ""}`}
                      onClick={() => handleSelect(row.symbol)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold flex items-center gap-2">
                          <SymbolAvatar symbol={row.symbol} size={16} />
                          <AssetHover symbol={row.symbol}>
                            <span>{row.symbol}</span>
                          </AssetHover>
                        </div>
                        <span className="chip">{actionLabel(row.action)}</span>
                      </div>
                      <div className="mt-1 text-xs opacity-70">{formatHorizonLabel(row.horizon as string | undefined)}</div>
                      <div className="mt-2 text-sm opacity-80">
                        {confidence != null ? `${confidence}% certeza` : "Sin certeza disponible"}
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded-full border ${pinnedNow ? "bg-[--primary] text-white border-transparent" : "bg-white/10 border-white/15"}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            togglePin(row.symbol);
                          }}
                        >
                          {pinnedNow ? "Fijado" : "Fijar"}
                        </span>
                        {row.stops?.tp != null && row.stops?.sl != null && (
                          <span className="opacity-70">con protecciones</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        {showHelp && feed && (
          <div className="text-xs opacity-70">
            Sugerencia: usa &quot;Fijar&quot; para mantener tus activos favoritos en la parte superior.
          </div>
        )}
      </div>
    </main>
  );
}


