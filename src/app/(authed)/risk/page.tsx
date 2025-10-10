"use client";

import { useEffect, useMemo, useState } from "react";
import { notify } from "@/lib/notify";
import { RiskInputs, RiskProfile, scoreRisk, saveRiskProfile, loadRiskProfile } from "@/lib/invest";
import { FeedItem, getFeed } from "@/lib/api.feed";

const defaultInputs: RiskInputs = {
  age: 30,
  horizonYears: 10,
  experience: "basic",
  incomeStability: "medium",
  maxDrawdownTolerance: "20",
};

type ProfileGuide = {
  tone: string;
  summary: string;
  actions: string[];
  thresholds: {
    minConf: number;
    maxSigma: number;
    stopCopy: string;
    label: string;
  };
  explanation: {
    confidence: string;
    uncertainty: string;
    stops: string;
  };
  analogy: string;
  signalCopy: string;
};

const profileGuides: Record<RiskProfile, ProfileGuide> = {
  Conservador: {
    tone: "Crecimiento estable",
    summary:
      "Buscas avanzar sin sobresaltos. Solo seguimos señales cuando el modelo está muy seguro y el mercado se mueve despacio.",
    actions: [
      "Reserva un fondo de emergencia y solo arriesga excedentes.",
      "Prefiere pocas señales pero de alta calidad, revisa cada semana.",
      "Ajusta stops cercanos: salir rápido vale más que perseguir cada punto.",
    ],
    thresholds: {
      minConf: 0.6,
      maxSigma: 0.04,
      stopCopy: "Stops cortos",
      label: "Confianza ≥ 60 %, Incertidumbre ≤ 4 %, stops cortos.",
    },
    explanation: {
      confidence: "Solo tomamos señales cuando la probabilidad supera 60 %. Es como avanzar con el semáforo bien verde.",
      uncertainty: "Si la incertidumbre (sigma) es mayor a 4 %, preferimos esperar a que el mercado se calme.",
      stops: "El stop loss va cerca del precio actual para cortar pérdidas rápido.",
    },
    analogy:
      "Imagina manejar de noche con lluvia: avanzas solo cuando ves claramente el camino y frenas ante cualquier duda.",
    signalCopy: "Esta selección prioriza señales con certeza alta y movimientos muy controlados.",
  },
  Moderado: {
    tone: "Equilibrio en marcha",
    summary:
      "Quieres un punto medio: exigís buena probabilidad, pero aceptás cierta vibración del mercado para no perder oportunidades.",
    actions: [
      "Define un monto fijo mensual para invertir y mantener el ritmo.",
      "Combina señales conservadoras con algunas que tengan más recorrido.",
      "Revisa tus stops cada quince días para confirmar que siguen cómodos.",
    ],
    thresholds: {
      minConf: 0.55,
      maxSigma: 0.07,
      stopCopy: "Stops medios",
      label: "Confianza ≥ 55 %, Incertidumbre ≤ 7 %, stops medios.",
    },
    explanation: {
      confidence:
        "Pedimos al menos 55 % de probabilidad. Aceptamos oportunidades con una luz verde intensa, aunque no perfecta.",
      uncertainty:
        "Mientras la incertidumbre se mantenga debajo de 7 %, seguimos la señal. Si sube de ahí, preferimos esperar.",
      stops: "El stop loss está a una distancia media para darle espacio al precio sin arriesgar de más.",
    },
    analogy:
      "Piensa en una caminata con viento: sigues avanzando, pero ajustas el paso si las ráfagas se vuelven muy fuertes.",
    signalCopy: "Balanceamos certezas aceptables con ruido moderado para no quedarnos afuera de oportunidades.",
  },
  Agresivo: {
    tone: "Crecimiento acelerado",
    summary:
      "Estás dispuesto a convivir con más movimiento si la señal tiene potencial. El foco es aprovechar tendencias largas.",
    actions: [
      "Diversifica entre sectores para que ninguna señal pese demasiado.",
      "Destina un porcentaje a liquidez para entrar rápido cuando aparezcan setups atractivos.",
      "Analiza el racional detrás de cada señal para sostenerla aun con movimientos bruscos.",
    ],
    thresholds: {
      minConf: 0.52,
      maxSigma: 0.1,
      stopCopy: "Stops amplios",
      label: "Confianza ≥ 52 %, Incertidumbre ≤ 10 %, stops amplios.",
    },
    explanation: {
      confidence:
        "Aceptas señales a partir de 52 % de probabilidad: sabes que no hay certeza total, pero confías en la tendencia.",
      uncertainty:
        "Toleras hasta 10 % de incertidumbre (sigma). Si el mercado vibra más que eso, es mejor pausar.",
      stops:
        "El stop loss se deja más lejos del precio para sobrevivir a saltos y aprovechar el recorrido completo.",
    },
    analogy:
      "Es como surfear una ola grande: sabés que se mueve fuerte, pero te mantienes si la dirección sigue a favor.",
    signalCopy: "Seleccionamos señales con buen potencial, incluso si el mercado está algo más inquieto.",
  },
};

const profileEducationCards = Object.entries(profileGuides).map(([profile, guide]) => ({
  profile: profile as RiskProfile,
  tone: guide.tone,
  summary: guide.summary,
  thresholds: guide.thresholds,
  explanation: guide.explanation,
  analogy: guide.analogy,
}));

const fieldHelp = {
  age: "La edad indica cuánto tiempo queda para recuperarte si el mercado baja.",
  horizon: "El horizonte es el tiempo que planeás dejar trabajar la inversión sin retirarla.",
  experience: "Elegí tu experiencia real para recibir ejemplos acordes.",
  income: "La estabilidad de ingresos marca cuánto margen tenés si surge un imprevisto.",
  drawdown: "El drawdown es la caída máxima tolerable antes de sentirte incómodo.",
};

const experienceHelp: Record<RiskInputs["experience"], string> = {
  none: "Nunca invertiste: iremos paso a paso con ejemplos concretos y sin tecnicismos.",
  basic: "Probaste productos sencillos y querés sumar constancia.",
  intermediate: "Tenés nociones de acciones o fondos diversificados.",
  advanced: "Te sentís cómodo analizando datos y tomando decisiones complejas.",
};

const incomeHelp: Record<RiskInputs["incomeStability"], string> = {
  low: "Ingresos variables: conviene mantener liquidez y seleccionar pocas señales.",
  medium: "Ingresos estables pero con posibilidad de cambios. Buscamos equilibrio entre seguridad y crecimiento.",
  high: "Ingresos muy estables: podés tolerar temporales del mercado si el plan es claro.",
};

const drawdownHelp: Record<RiskInputs["maxDrawdownTolerance"], string> = {
  "10": "Una baja del 10 % equivale a ver $100.000 caer a $90.000. Es una postura muy prudente.",
  "20": "Un 20 % de caída es común en mercados normales. Requiere calma y seguimiento.",
  "35": "Aceptar 35 % implica convivir con subas y bajas grandes, ideal si pensás a varios años.",
  "50": "Un 50 % de drawdown sólo conviene si tenés experiencia y horizonte largo.",
};

const quickSteps = [
  {
    title: "Define una meta clara",
    detail: "¿Para qué invertís? Un objetivo concreto (viaje, retiro, anticipo) ayuda a sostener el plan.",
  },
  {
    title: "Activa recordatorios simples",
    detail: "Agenda revisar tu plan una vez por mes. La constancia importa más que tomar decisiones diarias.",
  },
  {
    title: "Arranca con montos cómodos",
    detail: "Podes invertir pequeños aportes automáticos y sumar más a medida que entiendas tu perfil.",
  },
  {
    title: "Usa la guía del perfil",
    detail: "Cada perfil ya filtra señales por confianza e incertidumbre. Dejá que el sistema reduzca opciones por vos.",
  },
];

const TOOLTIP_CERTAINTY =
  "Nivel de certeza: probabilidad estimada de que la señal se cumpla. Se expresa como porcentaje (> 50 % indica sesgo a favor).";
const TOOLTIP_UNCERTAINTY =
  "Incertidumbre (sigma): cuánto puede vibrar el precio. Un sigma alto equivale a un semáforo en amarillo.";
type EvaluatedSignal = {
  signal: FeedItem;
  confidence: number | null;
  sigma: number | null;
  passes: boolean;
  reason: string | null;
  meetsConfidence: boolean;
  meetsSigma: boolean;
};

function formatPercent(value: number | null | undefined, decimals = 0): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "s/d";
  return `${(value * 100).toFixed(decimals)}%`;
}

function formatPriceWithDiff(level: number | null | undefined, reference: number | null | undefined): string {
  if (typeof level !== "number" || !Number.isFinite(level)) return "No disponible";
  if (typeof reference === "number" && Number.isFinite(reference) && reference !== 0) {
    const diff = ((level - reference) / reference) * 100;
    const diffText = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
    return `${level.toFixed(2)} (${diffText})`;
  }
  return level.toFixed(2);
}

function evaluateSignal(signal: FeedItem, guide: ProfileGuide): EvaluatedSignal {
  const confidence =
    typeof signal.p_conf === "number" && Number.isFinite(signal.p_conf) ? Math.max(0, Math.min(1, signal.p_conf)) : null;
  const sigma =
    typeof signal.sigma === "number" && Number.isFinite(signal.sigma) ? Math.max(0, Math.min(1, signal.sigma)) : null;
  const meetsConfidence = confidence != null && confidence >= guide.thresholds.minConf;
  const meetsSigma = sigma != null && sigma <= guide.thresholds.maxSigma;
  const actionable = signal.action !== "ABSTAIN";

  let reason: string | null = null;
  if (!actionable) {
    reason = signal.abstain_reason ?? "El modelo recomienda esperar antes de actuar.";
  } else if (!meetsConfidence) {
    reason = "El nivel de confianza es insuficiente para este perfil.";
  } else if (!meetsSigma) {
    reason = "Nos abstenemos por incertidumbre alta.";
  }

  return {
    signal,
    confidence,
    sigma,
    meetsConfidence,
    meetsSigma,
    passes: actionable && meetsConfidence && meetsSigma,
    reason,
  };
}

function describeAction(action: FeedItem["action"]): string {
  if (action === "BUY") return "Comprar";
  if (action === "SELL") return "Vender";
  if (action === "HOLD") return "Mantener";
  return "Esperar";
}
export default function RiskPage() {
  const [inputs, setInputs] = useState<RiskInputs>(defaultInputs);
  const [result, setResult] = useState<ReturnType<typeof scoreRisk> | null>(null);
  const [showCoach, setShowCoach] = useState(false);
  const [wasRecovered, setWasRecovered] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const [signals, setSignals] = useState<FeedItem[]>([]);
  const [signalsLoading, setSignalsLoading] = useState<boolean>(true);
  const [signalsError, setSignalsError] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadRiskProfile();
    if (saved) {
      setInputs(saved.inputs);
      setResult({ score: saved.score, profile: saved.profile, rationale: saved.rationale });
      setWasRecovered(true);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setSignalsLoading(true);
        setSignalsError(null);
        const feed = await getFeed({ limit: 12 });
        if (!alive) return;
        setSignals(feed);
      } catch (err) {
        if (!alive) return;
        const message = err instanceof Error ? err.message : "No pudimos cargar las señales en este momento.";
        setSignalsError(message);
      } finally {
        if (alive) setSignalsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const preview = useMemo(() => scoreRisk(inputs), [inputs]);
  const activeScore = result?.score ?? preview.score;
  const activeProfile = result?.profile ?? preview.profile;
  const activeGuide = profileGuides[activeProfile];
  const thresholds = activeGuide.thresholds;

  const evaluatedSignals = useMemo(
    () =>
      signals
        .map((signal) => evaluateSignal(signal, activeGuide))
        .sort((a, b) => {
          const aValue = (a.confidence ?? 0) - (a.sigma ?? 0);
          const bValue = (b.confidence ?? 0) - (b.sigma ?? 0);
          return bValue - aValue;
        }),
    [signals, activeGuide],
  );

  const passingSignals = evaluatedSignals.filter((item) => item.passes);
  const rejectedSignals = evaluatedSignals.filter((item) => !item.passes);

  function onCalc(e: React.FormEvent) {
    e.preventDefault();
    const r = scoreRisk(inputs);
    setResult(r);
    saveRiskProfile({ ...r, inputs });
    setLastSaved(new Date().toLocaleTimeString());
    setWasRecovered(true);
    notify(`Perfil guardado: ${r.profile} (score ${r.score})`);
  }

  function onClear() {
    setInputs(defaultInputs);
    setResult(null);
    setLastSaved(null);
    setWasRecovered(false);
    notify("Se restablecieron los valores iniciales.");
  }

  function handleRoadmap(feature: string) {
    notify(`${feature} llegará pronto. Estamos trabajando en ello.`);
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10">
        <header className="flex flex-col gap-8 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-900/30 to-background p-8 shadow-xl md:flex-row md:items-start md:justify-between">
          <div className="space-y-5">
            <span className="inline-flex items-center rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-wide text-white/70">
              Asistente de perfil
            </span>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold leading-tight">Construyamos tu perfil de inversión</h1>
              <p className="text-sm text-white/70">
                Responde preguntas simples, entérate qué perfil te conviene y deja que el sistema filtre las señales por
                vos. Todo en lenguaje claro, sin tecnicismos.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowCoach((v) => !v)}
                className="rounded-xl border border-white/20 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10"
              >
                {showCoach ? "Ocultar guía principiante" : "Necesito una guía simple"}
              </button>
              <button className="btn" type="button" onClick={() => handleRoadmap("Simular con IA")}>
                Simular con IA
              </button>
              <button
                type="button"
                className="rounded-xl border border-emerald-400/60 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/20"
                onClick={() => handleRoadmap("Ver historial")}
              >
                Ver historial
              </button>
              {wasRecovered && (
                <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                  Perfil cargado desde este dispositivo
                </span>
              )}
            </div>
          </div>
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-black/35 p-6 backdrop-blur">
            <div className="text-xs uppercase tracking-wide text-white/60">Tu vista previa</div>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-4xl font-semibold">{activeScore}</span>
              <span className="text-sm text-white/60">de 100</span>
            </div>
            <div className="mt-2 text-sm font-semibold text-emerald-200">{activeProfile}</div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, activeScore))}%` }}
              />
            </div>
            <p className="mt-4 text-sm text-white/70">{activeGuide.summary}</p>
            <div className="mt-4 rounded-xl border border-white/15 bg-black/30 p-3 text-xs text-white/70">
              <div className="font-semibold text-white/80">Reglas para señales</div>
              <p className="mt-1">{activeGuide.signalCopy}</p>
              <p className="mt-2 text-white/65">{activeGuide.thresholds.label}</p>
            </div>
            {lastSaved && (
              <p className="mt-4 text-xs text-white/60">Última vez guardado a las {lastSaved}.</p>
            )}
          </div>
        </header>
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <form
            onSubmit={onCalc}
            className="grid gap-5 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-lg"
          >
            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Edad</span>
              <input
                type="number"
                min={18}
                max={99}
                value={inputs.age}
                onChange={(e) => setInputs({ ...inputs, age: Number(e.target.value) })}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-400/40"
              />
              <p className="text-xs text-white/60">{fieldHelp.age}</p>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Horizonte (años)</span>
              <input
                type="number"
                min={1}
                max={40}
                value={inputs.horizonYears}
                onChange={(e) => setInputs({ ...inputs, horizonYears: Number(e.target.value) })}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-400/40"
              />
              <p className="text-xs text-white/60">{fieldHelp.horizon}</p>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Experiencia</span>
              <select
                value={inputs.experience}
                onChange={(e) => setInputs({ ...inputs, experience: e.target.value as RiskInputs["experience"] })}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-400/40"
              >
                <option value="none">Nunca invertí</option>
                <option value="basic">Básica</option>
                <option value="intermediate">Intermedia</option>
                <option value="advanced">Avanzada</option>
              </select>
              <p className="text-xs text-white/60">{fieldHelp.experience}</p>
              {showCoach && (
                <p className="text-xs text-white/60">{experienceHelp[inputs.experience]}</p>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Estabilidad de ingresos</span>
              <select
                value={inputs.incomeStability}
                onChange={(e) => setInputs({ ...inputs, incomeStability: e.target.value as RiskInputs["incomeStability"] })}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-400/40"
              >
                <option value="low">Varían seguido</option>
                <option value="medium">Regulares</option>
                <option value="high">Muy estables</option>
              </select>
              <p className="text-xs text-white/60">{fieldHelp.income}</p>
              {showCoach && (
                <p className="text-xs text-white/60">{incomeHelp[inputs.incomeStability]}</p>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
                Tolerancia a caída máxima (drawdown)
              </span>
              <select
                value={inputs.maxDrawdownTolerance}
                onChange={(e) =>
                  setInputs({ ...inputs, maxDrawdownTolerance: e.target.value as RiskInputs["maxDrawdownTolerance"] })
                }
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-400/40"
              >
                <option value="10">10%</option>
                <option value="20">20%</option>
                <option value="35">35%</option>
                <option value="50">50%</option>
              </select>
              <p className="text-xs text-white/60">{fieldHelp.drawdown}</p>
              {showCoach && (
                <p className="text-xs text-white/60">{drawdownHelp[inputs.maxDrawdownTolerance]}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button className="btn" type="submit">
                Calcular y guardar
              </button>
              <button
                className="rounded-xl border border-white/20 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10"
                type="button"
                onClick={onClear}
              >
                Restablecer
              </button>
            </div>
          </form>

          <aside className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-lg">
            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs uppercase tracking-wide text-white/60">Perfil sugerido</span>
                {lastSaved && <span className="text-[0.65rem] text-white/60">Guardado {lastSaved}</span>}
              </div>
              <div className="mt-3 text-2xl font-semibold">{activeProfile}</div>
              <div className="text-sm text-white/60">Score {activeScore}/100</div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-teal-400 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, activeScore))}%` }}
              />
            </div>
            <p className="text-sm text-white/70">{result?.rationale ?? activeGuide.summary}</p>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-white/60">Pasos sugeridos</div>
              <ul className="space-y-2">
                {activeGuide.actions.map((action) => (
                  <li key={action} className="flex gap-3 text-sm text-white/75">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400" />
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
            {showCoach && (
              <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-xs text-white/70">
                <div className="text-sm font-semibold text-white/80">Coach rápido</div>
                <p className="mt-2">{experienceHelp[inputs.experience]}</p>
                <p className="mt-2">{incomeHelp[inputs.incomeStability]}</p>
                <p className="mt-2">{drawdownHelp[inputs.maxDrawdownTolerance]}</p>
              </div>
            )}
          </aside>
        </section>
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Aplicar tu perfil a las señales de Aura</h2>
              <p className="text-sm text-white/70">
                Filtramos las señales actuales respetando tus límites: {activeGuide.thresholds.label.replace("Confianza", "confianza")}
              </p>
            </div>
            <div className="rounded-full border border-emerald-400/50 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
              {passingSignals.length} aptas • {rejectedSignals.length} descartadas
            </div>
          </div>

          {signalsLoading ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={`skeleton-${idx}`}
                  className="animate-pulse rounded-2xl border border-white/10 bg-black/20 p-5"
                >
                  <div className="h-4 w-1/3 rounded bg-white/10" />
                  <div className="mt-3 h-3 w-1/2 rounded bg-white/10" />
                  <div className="mt-6 h-2 w-full rounded bg-white/10" />
                  <div className="mt-2 h-2 w-3/4 rounded bg-white/10" />
                  <div className="mt-5 h-10 w-full rounded bg-white/10" />
                </div>
              ))}
            </div>
          ) : signalsError ? (
            <div className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-200">
              {signalsError}
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {evaluatedSignals.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/70">
                  No encontramos señales en este momento. Volvé a intentarlo más tarde.
                </div>
              )}
              {evaluatedSignals.map(({ signal, passes, reason, confidence, sigma }) => {
                const confidenceText = formatPercent(confidence, 0);
                const sigmaText = formatPercent(sigma, 1);
                const tpText = formatPriceWithDiff(signal.stops?.tp ?? null, signal.last_close);
                const slText = formatPriceWithDiff(signal.stops?.sl ?? null, signal.last_close);
                const rationaleText =
                  typeof signal.rationale === "string" && signal.rationale.trim().length > 0
                    ? signal.rationale
                    : null;

                return (
                  <article
                    key={`${signal.symbol}-${signal.ts ?? signal.action}`}
                    className={`flex h-full flex-col justify-between rounded-2xl border p-5 transition ${
                      passes
                        ? "border-emerald-400/60 bg-emerald-400/10 shadow-lg"
                        : "border-white/10 bg-black/25 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-white/60">{signal.horizon ?? "Horizonte"}</div>
                        <div className="text-lg font-semibold text-white/85">{signal.symbol}</div>
                        <div className="text-sm text-white/65">{describeAction(signal.action)}</div>
                      </div>
                      <div className="text-right text-xs text-white/60">
                        <div>Precio ref.</div>
                        <div className="text-sm text-white/80">
                          {typeof signal.last_close === "number" && Number.isFinite(signal.last_close)
                            ? signal.last_close.toFixed(2)
                            : "s/d"}
                        </div>
                        {signal.model_version && (
                          <div className="mt-1 text-[0.65rem] uppercase tracking-wide text-white/50">
                            Modelo {signal.model_version}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 space-y-3 text-sm text-white/75">
                      <div title={TOOLTIP_CERTAINTY}>
                        <div className="flex items-center justify-between gap-2">
                          <span>Nivel de certeza</span>
                          <span className="font-semibold text-white/85">{confidenceText}</span>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full rounded-full ${
                              passes ? "bg-emerald-400" : "bg-amber-400"
                            } transition-all`}
                            style={{ width: `${Math.min(100, Math.max(0, (confidence ?? 0) * 100))}%` }}
                          />
                        </div>
                      </div>

                      <div title={TOOLTIP_UNCERTAINTY}>
                        <div className="flex items-center justify-between gap-2">
                          <span>Incertidumbre</span>
                          <span className="font-semibold text-white/85">{sigmaText}</span>
                        </div>
                        <p className="mt-1 text-xs text-white/60">
                          Incertidumbre alta equivale a un semáforo en amarillo: el precio puede vibrar más de la cuenta.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-black/25 p-4 text-sm text-white/75">
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-wide text-white/60">Meta de ganancia</span>
                        <span className="font-medium text-white/85">{tpText}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-wide text-white/60">Piso de protección</span>
                        <span className="font-medium text-white/85">{slText}</span>
                      </div>
                      <p className="text-xs text-white/60">
                        {thresholds.stopCopy}: protegemos la operación usando stops adaptados al perfil.
                      </p>
                    </div>

                    <div className="mt-4 rounded-xl border px-3 py-2 text-sm">
                      {passes ? (
                        <div className="border-emerald-400/40 bg-emerald-400/10 text-emerald-200">
                          Señal apta para tu perfil. Confianza mínima {formatPercent(thresholds.minConf, 0)} y
                          incertidumbre máxima {formatPercent(thresholds.maxSigma, 1)}.
                        </div>
                      ) : (
                        <div className="border-amber-400/40 bg-amber-400/10 text-amber-200">
                          {reason ??
                            "Revisá esta señal con calma: hoy no cumple con las reglas del perfil seleccionado."}
                        </div>
                      )}
                    </div>

                    {rationaleText && (
                      <p className="mt-3 text-xs text-white/60">
                        ¿Por qué la señal? {rationaleText}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-lg">
          <h2 className="text-lg font-semibold">¿Qué significa cada perfil?</h2>
          <p className="mt-2 text-sm text-white/70">
            Usa estas referencias para entender cómo se traduce cada perfil en reglas concretas: confianza mínima,
            tolerancia a la incertidumbre y tamaño de stops.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {profileEducationCards.map((card) => (
              <article
                key={card.profile}
                className={`rounded-2xl border p-5 transition ${
                  activeProfile === card.profile
                    ? "border-emerald-400/60 bg-emerald-400/10 shadow-lg"
                    : "border-white/10 bg-black/20 hover:border-white/20"
                }`}
              >
                <div className="text-sm font-semibold uppercase tracking-wide text-white/80">
                  {card.profile}
                </div>
                <p className="mt-2 text-sm text-white/70">{card.summary}</p>
                <ul className="mt-4 space-y-2 text-sm text-white/70">
                  <li>
                    <span className="font-semibold text-white/80">Confianza mínima:</span>{" "}
                    {formatPercent(card.thresholds.minConf, 0)}. {card.explanation.confidence}
                  </li>
                  <li>
                    <span className="font-semibold text-white/80">Incertidumbre máxima:</span>{" "}
                    {formatPercent(card.thresholds.maxSigma, 1)}. {card.explanation.uncertainty}
                  </li>
                  <li>
                    <span className="font-semibold text-white/80">Stops:</span> {card.thresholds.stopCopy}.{" "}
                    {card.explanation.stops}
                  </li>
                </ul>
                <p className="mt-4 text-xs text-white/60">{card.analogy}</p>
              </article>
            ))}
          </div>
        </section>

        {showCoach && (
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Guía rápida sin tecnicismos</h2>
            <p className="mt-2 text-sm text-white/70">
              Sigue estos pasos cortos para sentir control del proceso incluso si es tu primera experiencia invirtiendo.
            </p>
            <ol className="mt-4 grid gap-4 md:grid-cols-2">
              {quickSteps.map((step, idx) => (
                <li
                  key={step.title}
                  className="rounded-xl border border-white/10 bg-black/25 p-5 transition hover:border-white/20"
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
                    Paso {idx + 1}
                  </span>
                  <h3 className="mt-2 text-base font-semibold text-white/80">{step.title}</h3>
                  <p className="mt-2 text-sm text-white/70">{step.detail}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
