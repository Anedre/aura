"use client";

import { useEffect, useState } from "react";
import { notify } from "@/lib/notify";
import { RiskInputs, scoreRisk, saveRiskProfile, loadRiskProfile } from "@/lib/invest";

export default function RiskPage() {
  const [inputs, setInputs] = useState<RiskInputs>({
    age: 30,
    horizonYears: 10,
    experience: "basic",
    incomeStability: "medium",
    maxDrawdownTolerance: "20",
  });
  const [result, setResult] = useState<ReturnType<typeof scoreRisk> | null>(null);

  useEffect(() => {
    const saved = loadRiskProfile();
    if (saved) {
      setInputs(saved.inputs);
      setResult({ score: saved.score, profile: saved.profile, rationale: saved.rationale });
    }
  }, []);

  function onCalc(e: React.FormEvent) {
    e.preventDefault();
    const r = scoreRisk(inputs);
    setResult(r);
    saveRiskProfile({ ...r, inputs });
    notify(`Perfil guardado: ${r.profile} (score ${r.score})`);
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <h1 className="text-2xl font-bold">Perfil de inversión</h1>

        <form onSubmit={onCalc} className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <label className="grid gap-1">
            <span className="text-xs opacity-70">Edad</span>
            <input type="number" min={18} max={99} value={inputs.age}
              onChange={e => setInputs({ ...inputs, age: Number(e.target.value) })}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2" />
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70">Horizonte (años)</span>
            <input type="number" min={1} max={40} value={inputs.horizonYears}
              onChange={e => setInputs({ ...inputs, horizonYears: Number(e.target.value) })}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2" />
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70">Experiencia</span>
            <select
              value={inputs.experience}
              onChange={e => setInputs({ ...inputs, experience: e.target.value as RiskInputs["experience"] })}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <option value="none">Nula</option>
              <option value="basic">Básica</option>
              <option value="intermediate">Intermedia</option>
              <option value="advanced">Avanzada</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70">Estabilidad de ingresos</span>
            <select
              value={inputs.incomeStability}
              onChange={e => setInputs({ ...inputs, incomeStability: e.target.value as RiskInputs["incomeStability"] })}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70">Tolerancia a caída máxima (drawdown)</span>
            <select
              value={inputs.maxDrawdownTolerance}
              onChange={e => setInputs({ ...inputs, maxDrawdownTolerance: e.target.value as RiskInputs["maxDrawdownTolerance"] })}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <option value="10">10%</option>
              <option value="20">20%</option>
              <option value="35">35%</option>
              <option value="50">50%</option>
            </select>
          </label>

          <div className="flex gap-2 pt-2">
            <button className="btn" type="submit">Calcular y guardar</button>
            <button className="btn" type="button" onClick={() => { setResult(null); }}>
              Limpiar
            </button>
          </div>
        </form>

        {result && (
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <div className="text-sm">Perfil: <b>{result.profile}</b></div>
            <div className="text-sm">Score: {result.score}/100</div>
            <div className="text-xs opacity-70 mt-2">{result.rationale}</div>
          </section>
        )}
      </div>
    </main>
  );
}
