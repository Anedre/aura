"use client";

import { useEffect, useState } from "react";
import { notify } from "@/lib/notify";
import { type InvestRequest, listRequests, saveRequest, deleteRequest, loadRiskProfile } from "@/lib/invest";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function InvestRequestPage() {
  const [symbol, setSymbol] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<"USD"|"PEN">("USD");
  const [source, setSource] = useState("");
  const [date, setDate] = useState<string>("");
  const [rows, setRows] = useState<InvestRequest[]>([]);

  useEffect(() => { setRows(listRequests()); }, []);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol.trim() || amount <= 0 || !date) {
      notify("Completa símbolo, monto y fecha.");
      return;
    }
    const risk = loadRiskProfile()?.profile;
    const rec: InvestRequest = {
      id: uid(),
      symbol: symbol.toUpperCase().trim(),
      amount: Number(amount),
      currency,
      sourceAccount: source.trim() || "N/A",
      execDate: date,
      createdAt: new Date().toISOString(),
      riskProfile: risk,
    };
    saveRequest(rec);
    setRows(listRequests());
    setSymbol(""); setAmount(0); setSource(""); setDate("");
    notify("Solicitud guardada localmente (demo).");
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <h1 className="text-2xl font-bold">Solicitud de inversión</h1>

        <form onSubmit={save} className="grid sm:grid-cols-2 gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <label className="grid gap-1">
            <span className="text-xs opacity-70">Símbolo</span>
            <input value={symbol} onChange={e => setSymbol(e.target.value)}
              placeholder="AAPL, BTC-USD, SPY…"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2" />
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70">Monto</span>
            <input type="number" min={0} value={amount} onChange={e => setAmount(Number(e.target.value))}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2" />
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70">Moneda</span>
            <select value={currency} onChange={e => setCurrency(e.target.value as "USD"|"PEN")}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <option value="USD">USD</option>
              <option value="PEN">PEN</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70">Cuenta de origen</span>
            <input value={source} onChange={e => setSource(e.target.value)}
              placeholder="Cuenta/alias (opcional)"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2" />
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-70">Fecha de ejecución</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2" />
          </label>

          <div className="flex items-end">
            <button className="btn" type="submit">Guardar solicitud</button>
          </div>
        </form>

        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="font-semibold mb-3">Solicitudes registradas (local)</h2>
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
                    <td className="p-2">{r.riskProfile ?? "—"}</td>
                    <td className="p-2">{r.execDate}</td>
                    <td className="p-2">{r.sourceAccount}</td>
                    <td className="p-2">
                      <button className="btn" onClick={() => { deleteRequest(r.id); setRows(listRequests()); }}>
                        Borrar
                      </button>
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
