// src/lib/invest.ts

// =========================
// Tipos de Perfil de Riesgo
// =========================
export type RiskInputs = {
  age: number;                 // años (18..99)
  horizonYears: number;        // 1..40
  experience: "none" | "basic" | "intermediate" | "advanced";
  incomeStability: "low" | "medium" | "high";
  maxDrawdownTolerance: "10" | "20" | "35" | "50"; // % aceptable de caída
};

export type RiskProfile = "Conservador" | "Moderado" | "Agresivo";

export type RiskResult = {
  score: number;       // 0..100
  profile: RiskProfile;
  rationale: string;   // explicación corta
};

type PersistedRisk = RiskResult & { inputs: RiskInputs };

const RISK_KEY = "aura_risk_profile";
const REQ_KEY  = "aura_invest_requests";

// ===================
// Scoring de Riesgo
// ===================
export function scoreRisk(i: RiskInputs): RiskResult {
  let s = 0;

  // Edad: más joven, mayor score
  s += i.age < 30 ? 22 : i.age < 45 ? 16 : i.age < 60 ? 10 : 5;

  // Horizonte de inversión
  s += i.horizonYears >= 15 ? 22 : i.horizonYears >= 7 ? 16 : 8;

  // Experiencia
  s += i.experience === "advanced" ? 20
      : i.experience === "intermediate" ? 14
      : i.experience === "basic" ? 8
      : 3;

  // Estabilidad de ingresos
  s += i.incomeStability === "high" ? 18
      : i.incomeStability === "medium" ? 12
      : 6;

  // Tolerancia a drawdown
  s += i.maxDrawdownTolerance === "50" ? 18
      : i.maxDrawdownTolerance === "35" ? 12
      : i.maxDrawdownTolerance === "20" ? 7
      : 3;

  const score = Math.max(0, Math.min(100, Math.round(s)));
  const profile: RiskProfile = score >= 70 ? "Agresivo" : score >= 45 ? "Moderado" : "Conservador";

  const rationale =
    profile === "Agresivo"
      ? "Mayor tolerancia a volatilidad y horizonte largo; prioriza crecimiento."
      : profile === "Moderado"
      ? "Equilibrio entre crecimiento y preservación; tolera caídas acotadas."
      : "Foco en preservación de capital; menor tolerancia a caídas.";

  return { score, profile, rationale };
}

// ===================
// Type Guards (persistencia segura)
// ===================
function isRiskProfile(x: unknown): x is RiskProfile {
  return x === "Conservador" || x === "Moderado" || x === "Agresivo";
}
function isRiskInputs(x: unknown): x is RiskInputs {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  const expOK =
    o.experience === "none" ||
    o.experience === "basic" ||
    o.experience === "intermediate" ||
    o.experience === "advanced";
  const incOK =
    o.incomeStability === "low" ||
    o.incomeStability === "medium" ||
    o.incomeStability === "high";
  const ddOK =
    o.maxDrawdownTolerance === "10" ||
    o.maxDrawdownTolerance === "20" ||
    o.maxDrawdownTolerance === "35" ||
    o.maxDrawdownTolerance === "50";
  return (
    typeof o.age === "number" &&
    typeof o.horizonYears === "number" &&
    expOK && incOK && ddOK
  );
}
function isPersistedRisk(x: unknown): x is PersistedRisk {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.score === "number" &&
    typeof o.rationale === "string" &&
    isRiskProfile(o.profile) &&
    isRiskInputs(o.inputs)
  );
}

// ===================
// Persistencia de Perfil
// ===================
export function saveRiskProfile(r: PersistedRisk): void {
  try { localStorage.setItem(RISK_KEY, JSON.stringify(r)); } catch { /* noop */ }
}
export function loadRiskProfile(): PersistedRisk | null {
  try {
    const raw = localStorage.getItem(RISK_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPersistedRisk(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ===================
// Solicitud de Inversión (demo local)
// ===================
export type InvestRequest = {
  id: string;
  symbol: string;
  amount: number;
  currency: "USD" | "PEN";
  sourceAccount: string;
  execDate: string;   // YYYY-MM-DD
  createdAt: string;  // ISO
  riskProfile?: RiskProfile;
};

function isInvestRequest(x: unknown): x is InvestRequest {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  const currencyOK = o.currency === "USD" || o.currency === "PEN";
  const riskOK =
    o.riskProfile === undefined ||
    o.riskProfile === "Conservador" ||
    o.riskProfile === "Moderado" ||
    o.riskProfile === "Agresivo";
  return (
    typeof o.id === "string" &&
    typeof o.symbol === "string" &&
    typeof o.amount === "number" &&
    currencyOK &&
    typeof o.sourceAccount === "string" &&
    typeof o.execDate === "string" &&
    typeof o.createdAt === "string" &&
    riskOK
  );
}
function isInvestRequestArray(x: unknown): x is InvestRequest[] {
  return Array.isArray(x) && x.every(isInvestRequest);
}

export function listRequests(): InvestRequest[] {
  try {
    const raw = localStorage.getItem(REQ_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return isInvestRequestArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
export function saveRequest(r: InvestRequest): void {
  const all = listRequests();
  all.unshift(r);
  try { localStorage.setItem(REQ_KEY, JSON.stringify(all)); } catch { /* noop */ }
}
export function deleteRequest(id: string): void {
  const all = listRequests().filter(x => x.id !== id);
  try { localStorage.setItem(REQ_KEY, JSON.stringify(all)); } catch { /* noop */ }
}

// ===================
// Simulador (GBM + aportes)
// ===================
export type SimInput = {
  initial: number;        // monto inicial (>0)
  monthly: number;        // aporte mensual (>=0)
  months: number;         // horizonte en meses (>=1)
  annualReturn: number;   // ej. 0.12 = 12% anual
  annualVol: number;      // ej. 0.20 = 20% anual
  annualFee: number;      // ej. 0.01 = 1% anual (TER)
  paths?: number;         // número de simulaciones (>=100)
  seed?: number;          // semilla reproducible
};

export type SimSummary = {
  p5: number; p50: number; p95: number;
  probLoss: number;         // proporción de paths con pérdida final
  maxDD_median: number;     // máx. drawdown estimado del path mediano
  finalBalances: number[];  // finales de cada path (ordenados)
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function (): number {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function randn(prng: () => number): number {
  // Box–Muller
  let u = 0, v = 0;
  while (u === 0) u = prng();
  while (v === 0) v = prng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function simulateInvestment(inp: SimInput): SimSummary {
  const paths = Math.max(100, inp.paths ?? 1000);
  const seed = (inp.seed ?? 123456) | 0;

  // conversión anual → mensual (aproximación)
  const r_m = Math.pow(1 + inp.annualReturn, 1 / 12) - 1;
  const vol_m = inp.annualVol / Math.sqrt(12);
  const fee_m = Math.pow(1 - inp.annualFee, 1 / 12) - 1; // fee como drift negativo mensual

  const finals: number[] = [];
  let medianPathMaxDD = 0;

  for (let p = 0; p < paths; p++) {
    const prng = mulberry32(seed + p * 17 + 11);
    let w = Math.max(0, inp.initial);
    let peak = w;

    // Guardamos valores para el path "mediano" (~índice central) y calcular su DD
    const keepDD = p === Math.floor(paths / 2);
    let maxDDForThisPath = 0;

    for (let m = 0; m < Math.max(1, inp.months); m++) {
      const z = randn(prng);
      // Paso de GBM discreto con drift (retorno - fee) y ruido
      const step = (1 + r_m + fee_m) * Math.exp(vol_m * z - 0.5 * vol_m * vol_m);
      w = w * step + Math.max(0, inp.monthly);

      if (keepDD) {
        if (w > peak) peak = w;
        const dd = peak > 0 ? (peak - w) / peak : 0;
        if (dd > maxDDForThisPath) maxDDForThisPath = dd;
      }
    }

    if (keepDD) medianPathMaxDD = maxDDForThisPath;
    finals.push(w);
  }

  finals.sort((a, b) => a - b);

  const q = (p: number): number => {
    const idx = Math.max(0, Math.min(finals.length - 1, Math.floor((finals.length - 1) * p)));
    return finals[idx];
  };

  const p5  = q(0.05);
  const p50 = q(0.50);
  const p95 = q(0.95);
  const probLoss = finals.filter(x => x < inp.initial).length / finals.length;

  return {
    p5, p50, p95,
    probLoss,
    maxDD_median: medianPathMaxDD,
    finalBalances: finals
  };
}
