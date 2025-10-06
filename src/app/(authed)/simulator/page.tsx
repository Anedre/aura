"use client";

import { useMemo, useState } from "react";
import { notify } from "@/lib/notify";
import { simulateInvestment, type SimInput } from "@/lib/invest";

export default function SimulatorPage() {
  const [inp, setInp] = useState<SimInput>({
    initial: 1000,
    monthly: 100,
    months: 60,
    annualReturn: 0.12,
    annualVol: 0.20,
    annualFee: 0.01,
    paths: 1000,
  });

  const [out, setOut] = useState<ReturnType<typeof simulateInvestment> | null>(null);

  function run(e: React.FormEvent) {
    e.preventDefault();
    if (inp.initial <= 0 || inp.months < 1) {
      notify("Monto inicial > 0 y horizonte en meses >= 1.");
      return;
    }
    setOut(simulateInvestment(inp));
  }

  const fmt = (x: number) => x.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const roiMedian = useMemo(() => {
    if (!out) return 0;
    const gain = out.p50 - inp.initial;
    return (gain / Math.max(1, inp.initial)) * 100;
  }, [out, inp.initial]);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <h1 className="text-2xl font-bold">Simulador de inversión</h1>

        <form onSubmit={run} className="grid sm:grid-cols-2 gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <label className="grid gap-1">
            <span className="text-xs opacity-70">Monto inicial</span>
            <input type="number" min={1} value={inp.initial}
              onChange={e => setInp({ ...inp, initial: Number(e.target.value) })}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2" />
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70">Aporte mensual</span>
            <input type="number" min={0} value={inp.monthly}
              onChange={e => setInp({ ...inp, monthly: Number(e.target.value) })}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2" />
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70">Horizonte (meses)</span>
            <input type="number" min={1} max={600} value={inp.months}
              onChange={e => setInp({ ...inp, months: Number(e.target.value) })}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2" />
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70">Retorno anual esperado</span>
            <input type="number" step="0.01" value={inp.annualReturn}
              onChange={e => setInp({ ...inp, annualReturn: Number(e.target.value) })}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2" />
            <span className="text-xs opacity-60">Ej. 0.12 = 12% anual</span>
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70">Volatilidad anual</span>
            <input type="number" step="0.01" value={inp.annualVol}
              onChange={e => setInp({ ...inp, annualVol: Number(e.target.value) })}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2" />
            <span className="text-xs opacity-60">Ej. 0.20 = 20% anual</span>
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70">Comisión anual (TER)</span>
            <input type="number" step="0.001" value={inp.annualFee}
              onChange={e => setInp({ ...inp, annualFee: Number(e.target.value) })}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2" />
            <span className="text-xs opacity-60">Ej. 0.01 = 1% anual</span>
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70">N° simulaciones</span>
            <input type="number" min={100} max={5000} value={inp.paths ?? 1000}
              onChange={e => setInp({ ...inp, paths: Number(e.target.value) })}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2" />
          </label>

          <div className="flex items-end">
            <button className="btn" type="submit">Simular</button>
          </div>
        </form>

        {out && (
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 grid sm:grid-cols-2 gap-4">
            <div><div className="text-xs opacity-70">Final p5</div><div className="text-lg">{fmt(out.p5)}</div></div>
            <div><div className="text-xs opacity-70">Final mediano (p50)</div><div className="text-lg">{fmt(out.p50)} <span className="text-xs opacity-70">({roiMedian.toFixed(1)}%)</span></div></div>
            <div><div className="text-xs opacity-70">Final p95</div><div className="text-lg">{fmt(out.p95)}</div></div>
            <div><div className="text-xs opacity-70">Prob. de pérdida</div><div className="text-lg">{(out.probLoss*100).toFixed(1)}%</div></div>
            <div><div className="text-xs opacity-70">Máx. drawdown (path mediano)</div><div className="text-lg">{(out.maxDD_median*100).toFixed(1)}%</div></div>
          </section>
        )}
      </div>
    </main>
  );
}
