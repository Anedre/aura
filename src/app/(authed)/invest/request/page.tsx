"use client";

import { useEffect, useMemo, useState } from "react";
import { notify } from "@/lib/notify";
import { type InvestRequest, listRequests, saveRequest, deleteRequest, loadRiskProfile } from "@/lib/invest";
import { requestPrediction, type PredictionResult } from "@/lib/api.predict";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function InfoTip({ title, text }: { title: string; text: string }) {
  return (
    <span className="tooltip inline-flex items-center ml-1 align-middle">
      <span aria-label="info" className="inline-flex items-center justify-center w-4 h-4 text-[10px] rounded-full border opacity-80">i</span>
      <span className="tooltip-panel">
        <div className="tooltip-title">{title}</div>
        <div className="tooltip-text">{text}</div>
      </span>
    </span>
  );
}

function ExplainerSlides() {
  const slides = [
    {
      title: "¿Qué hace esta página?",
      text: "Solicita una predicción para el próximo cierre (día siguiente). Ingresas un activo y monto y mostramos la señal (sube/baja/espera) con su certeza.",
    },
    {
      title: "Datos que necesitas",
      text: "Símbolo (AAPL, BTC-USD, SPY), el monto y la fecha objetivo. Tu perfil de riesgo no cambia el horizonte: siempre es para el siguiente cierre.",
    },
    {
      title: "Cómo leer el resultado",
      text: "La señal es para el próximo cierre. La certeza va de 0% a 100%. TP/SL son niveles orientativos. No es consejo de inversión.",
    },
  ];

  const [i, setI] = useState(0);
  const next = () => setI((p) => (p + 1) % slides.length);
  const prev = () => setI((p) => (p - 1 + slides.length) % slides.length);

  return (
    <div className="card border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm opacity-70 mb-1">Guía rápida</div>
          <div className="text-lg font-semibold">{slides[i].title}</div>
          <p className="mt-1 text-sm opacity-90 max-w-3xl">{slides[i].text}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="btn btn-ghost" onClick={prev} aria-label="Anterior">◀</button>
          <div className="text-xs opacity-70">{i + 1} / {slides.length}</div>
          <button className="btn btn-ghost" onClick={next} aria-label="Siguiente">▶</button>
        </div>
      </div>
    </div>
  );
}

function ConfBar({ value }: { value: number | null | undefined }) {
  const v = value != null ? Math.max(0, Math.min(1, value)) : null;
  return (
    <div>
      <div className="flex items-center justify-between text-xs opacity-70 mb-1">
        <span>Certeza</span>
        <span>{v != null ? Math.round(v * 100) : 0}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${v != null ? v * 100 : 0}%` }} />
      </div>
    </div>
  );
}

export default function InvestRequestPage() {
  const [symbol, setSymbol] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<"USD"|"PEN">("USD");
  const [source, setSource] = useState("");
  const [date, setDate] = useState<string>("");
  const [horizon, setHorizon] = useState<string>("1d");
  const [rows, setRows] = useState<InvestRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResult | null>(null);

  const riskProfile = useMemo(() => loadRiskProfile()?.profile ?? null, []);

  useEffect(() => {
    setRows(listRequests());
  }, []);

  // El modelo es diario (próximo cierre); fijamos horizonte a 1d.
  useEffect(() => {
    setHorizon("1d");
  }, [riskProfile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const sym = symbol.toUpperCase().trim();
    if (!sym || amount <= 0 || !date) {
      notify("Completa símbolo, monto y fecha.");
      return;
    }

    const rec: InvestRequest = {
      id: uid(),
      symbol: sym,
      amount: Number(amount),
      currency,
      sourceAccount: source.trim() || "N/A",
      execDate: date,
      createdAt: new Date().toISOString(),
      riskProfile: riskProfile ?? undefined,
    };
    saveRequest(rec);
    setRows(listRequests());

    try {
      setLoading(true);
      const r = await requestPrediction({
        symbol: sym,
        amount,
        currency,
        horizon,
        risk_profile: riskProfile ?? undefined,
        exec_date: date,
      });
      setResult(r);
      notify("Predicción lista.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo obtener la predicción";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function prefillAndPredict(r: InvestRequest) {
    setSymbol(r.symbol);
    setAmount(r.amount);
    setCurrency(r.currency);
    setSource(r.sourceAccount);
    setDate(r.execDate);
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Solicitud de predicción</h1>
            <p className="text-sm opacity-80 mt-1">Pide una evaluación personalizada del activo que te interesa. Recibirás una señal del modelo y una certeza estimada.</p>
          </div>
          {riskProfile && (
            <div className="chip" title="Perfil de riesgo detectado">
              Perfil: {riskProfile}
            </div>
          )}
        </header>

        <ExplainerSlides />

        <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4 card border border-white/10 bg-white/[0.03] p-5">
          <label className="grid gap-1">
            <span className="text-xs opacity-70 flex items-center">Símbolo <InfoTip title="Símbolo del activo" text="Ejemplos: AAPL (Apple), SPY (ETF S&P 500), BTC-USD (Bitcoin)." /></span>
            <input value={symbol} onChange={e => setSymbol(e.target.value)}
              placeholder="AAPL, BTC-USD, SPY…"
              className="input" />
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70 flex items-center">Monto <InfoTip title="Tu inversión" text="Monto a invertir para esta evaluación. Puedes simular con montos pequeños." /></span>
            <input type="number" min={0} value={amount} onChange={e => setAmount(Number(e.target.value))}
              className="input" />
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70">Moneda</span>
            <select value={currency} onChange={e => setCurrency(e.target.value as "USD"|"PEN")} className="input">
              <option value="USD">USD</option>
              <option value="PEN">PEN</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70 flex items-center">Fecha objetivo <InfoTip title="¿Para cuándo?" text="Fecha en la que te interesa ejecutar la inversión o revisar la señal." /></span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input" />
          </label>

          <div className="grid gap-1">
            <span className="text-xs opacity-70 flex items-center">Horizonte <InfoTip title="Alcance del modelo" text="El modelo está entrenado para el próximo cierre (1 día)." /></span>
            <div className="input">Próximo cierre (1 día)</div>
          </div>

          <label className="grid gap-1">
            <span className="text-xs opacity-70">Cuenta de origen (opcional)</span>
            <input value={source} onChange={e => setSource(e.target.value)} placeholder="Cuenta/alias"
              className="input" />
          </label>

          <div className="md:col-span-2 flex items-center justify-between pt-2">
            <div className="text-xs opacity-70">Consejo: si no sabes qué símbolo usar, prueba con <code>SPY</code> o <code>AAPL</code>.</div>
            <div className="flex items-center gap-2">
              <button className="btn" type="button" onClick={() => { setSymbol(""); setAmount(0); setSource(""); setDate(""); setResult(null); setError(null); }}>Limpiar</button>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? "Consultando…" : "Solicitar predicción"}
              </button>
            </div>
          </div>
        </form>

        {(error || result || loading) && (
          <section className="card border border-white/10 bg-white/[0.03] p-5">
            <h2 className="font-semibold mb-3">Resultado del modelo</h2>
            {error && (
              <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-200 mb-3 text-sm">{error}</div>
            )}
            {loading && !error && (
              <div className="h-20 rounded-xl border border-white/10 bg-white/5 animate-pulse" />
            )}
            {result && !error && (
              <div className="grid md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="text-xl font-semibold">{result.symbol || symbol || "—"}</div>
                    <span className="chip">
                      {result.action === "BUY" ? "Señal: Sube" : result.action === "SELL" ? "Señal: Baja" : result.action === "HOLD" ? "En espera" : "Sin señal"}
                    </span>
                    {result.horizon && (
                      <span className="chip">{result.horizon === "1d" ? "Próximo cierre" : String(result.horizon)}</span>
                    )}
                  </div>
                  <ConfBar value={result.p_conf} />
                  {result.rationale && (
                    <div className="text-sm opacity-90">{result.rationale}</div>
                  )}
                  <div className="text-xs opacity-70">Nota: Las predicciones son estimaciones probabilísticas y no garantizan resultados. Invierte de forma responsable.</div>
                </div>
                <div className="space-y-2">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-xs opacity-70 mb-1">Último cierre</div>
                    <div className="text-lg font-semibold">{result.last_close != null ? result.last_close.toLocaleString() : "—"}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-xs opacity-70 mb-1">TP / SL sugeridos</div>
                    <div className="text-sm">{result.stops ? `${result.stops.tp} / ${result.stops.sl}` : "—"}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-xs opacity-70 mb-1">Modelo</div>
                    <div className="text-sm">{result.model_version || "N/D"}</div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        <section className="card border border-white/10 bg-white/[0.03] p-5">
          <h2 className="font-semibold mb-3">Historial de solicitudes (local)</h2>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="opacity-70">
                <tr>
                  <th className="text-left p-2">Fecha</th>
                  <th className="text-left p-2">Símbolo</th>
                  <th className="text-right p-2">Monto</th>
                  <th className="text-left p-2">Moneda</th>
                  <th className="text-left p-2">Perfil</th>
                  <th className="text-left p-2">Ejecución</th>
                  <th className="text-left p-2">Cuenta</th>
                  <th className="p-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-white/10">
                    <td className="p-2">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="p-2">{r.symbol}</td>
                    <td className="p-2 text-right">{r.amount.toLocaleString()}</td>
                    <td className="p-2">{r.currency}</td>
                    <td className="p-2">{r.riskProfile ?? "-"}</td>
                    <td className="p-2">{r.execDate}</td>
                    <td className="p-2">{r.sourceAccount}</td>
                    <td className="p-2 flex gap-2">
                      <button className="btn" onClick={() => { deleteRequest(r.id); setRows(listRequests()); }}>Borrar</button>
                      <button className="btn btn-primary" onClick={() => prefillAndPredict(r)}>Usar datos</button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td className="p-2 opacity-70" colSpan={8}>No hay solicitudes.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
