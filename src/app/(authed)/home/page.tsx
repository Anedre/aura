// src/app/(authed)/home/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadRiskProfile } from "@/lib/invest";
import MarketChartE from "@/components/MarketChartE";

// Si prefieres reutilizar fetchJSON desde lib/market, puedes importarlo:
// import { fetchJSON } from "@/lib/market";

type Horizon = "1d" | "1w";
type Action = "BUY" | "SELL" | "HOLD" | "ABSTAIN";

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

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/+$/, "");

// -------- utilidades presentación --------
function actionLabel(a: Action) {
  if (a === "BUY") return "Sube";
  if (a === "SELL") return "Baja";
  if (a === "HOLD") return "En espera";
  return "Sin señal clara";
}
function horizonLabel(h: Horizon) {
  return h === "1w" ? "Próximas semanas" : "Próximos días";
}

// -------- helpers de red --------
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

    // estados para el indicador
  const [rangeDelta, setRangeDelta] = useState<number | null>(null);
  const [rangeLabel, setRangeLabel] = useState<'1D'|'1W'|'1M'|'1Y'|'ALL'>('ALL');
    // en el header de la tarjeta


  // carga/refresh del feed
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setError(null);
        const data = await getFeed(horizon, minConf);
        if (!alive) return;
        setFeed(data);
        setUpdatedAt(new Date());

        // seleccionar símbolo por defecto (mejor certeza != ABSTAIN)
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
    void load();
    const id = setInterval(load, 90_000);
    return () => { alive = false; clearInterval(id); };
  }, [horizon, minConf, focus]);

  const current = useMemo(() => {
    if (!feed || !focus) return null;
    return feed.find((x) => x.symbol === focus) ?? null;
  }, [feed, focus]);

  // Deriva el símbolo desde tu selección actual (ajusta a tu estado real)
  const assetSymbol = useMemo<string | null>(() => {
    // casos típicos: current?.symbol viene de tu store/selección;
    // focus podría venir del search o url.
    if (current?.symbol && typeof current.symbol === 'string') return current.symbol;
    if (typeof focus === 'string' && focus.length > 0) return focus;
    return null; // SIN fallback. Si es null, no renderizamos el gráfico.
  }, [current?.symbol, focus]);

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
            <select
              value={horizon}
              onChange={(e) => setHorizon(e.target.value as Horizon)}
              className="toolbar"
              title="Periodo"
            >
              <option value="1d">Próximos días</option>
              <option value="1w">Próximas semanas</option>
            </select>

            <div className="toolbar">
              <label className="text-xs opacity-80 mr-2">Certeza mínima</label>
              <input
                type="range"
                min={55}
                max={80}
                value={Math.round(minConf * 100)}
                onChange={(e) => setMinConf(Number(e.target.value) / 100)}
              />
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
                  <div className="text-2xl font-semibold">{assetSymbol ?? '—'}</div>
                  {current && <span className="chip">{actionLabel(current.action)}</span>}
                  {confPct != null && <span className="chip">{confPct}% certeza</span>}
                  {current?.horizon && (
                    <span className="chip">{horizonLabel((current.horizon as Horizon) || "1d")}</span>
                  )}
                  {rangeDelta != null && (
                    <span
                      className={`chip ${rangeDelta >= 0 ? 'text-emerald-300 bg-emerald-500/10' : 'text-rose-300 bg-rose-500/10'}`}
                      title="Variación acumulada en el rango visible"
                    >
                      {rangeDelta >= 0 ? '▲' : '▼'} {Math.abs(rangeDelta).toFixed(2)}% ({rangeLabel})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {current && (
                    <button
                      className={`btn ${pinned.includes(current.symbol) ? "btn-primary" : ""}`}
                      onClick={() => togglePin(current.symbol)}
                    >
                      {pinned.includes(current.symbol) ? "Fijado" : "Fijar"}
                    </button>
                  )}
                </div>
              </div>

              {/* === Gráfico en tiempo real reutilizable === */}
             {assetSymbol ? (
                <MarketChartE
                  symbol={assetSymbol}
                  provider="yahoo"
                  tf="5m"
                  emaDurationsMin={[20, 60]}
                  height={440}
                  showGaps
                  showLastPrice
                  onRangeDelta={(d, r) => { setRangeDelta(d); setRangeLabel(r); }}
                  
                />
              ) : (
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-amber-200">
                  <div className="font-semibold">Falta símbolo</div>
                  <div className="text-sm opacity-80">
                    Selecciona un activo (o verifica que <code>current.symbol</code> / <code>focus</code> estén poblados).
                  </div>
                </div>
              )}
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
                  className={`card p-4 text-left transition ${
                    current?.symbol === it.symbol ? "ring-2 ring-[--ring]" : "hover:bg-white/10"
                  }`}
                  onClick={() => {
                    setFocus(it.symbol);
                    if (!pinnedNow) setPinned((p) => [it.symbol, ...p].slice(0, 6));
                  }}
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
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        pinnedNow ? "bg-[--primary] text-white border-transparent" : "bg-white/10 border-white/15"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(it.symbol);
                      }}
                    >
                      {pinnedNow ? "Fijado" : "Fijar"}
                    </span>
                    {it.stops?.tp != null && it.stops?.sl != null && (
                      <span className="text-xs opacity-70">con protecciones</span>
                    )}
                  </div>
                </button>
              );
            })}
        </section>
      </div>
    </main>
  );
}
