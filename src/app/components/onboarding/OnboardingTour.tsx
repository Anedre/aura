"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { loadRiskProfile, type RiskProfile } from "@/lib/invest";
import { createPortal } from "react-dom";

type StageId = "welcome" | "profile" | "risk" | "feed" | "asset" | "demo" | "home" | "completed";
type Anchor = "center" | "bottom-right" | "bottom-left" | "top-center";
type ExtraTipId = "invest" | "simulator";

type WaitForConfig = {
  event: string;
  selector: string;
};

type StepSequence = {
  id: string;
  title?: string;
  body: ReactNode;
  highlight?: string;
  anchor?: Anchor;
  waitFor?: WaitForConfig;
  scope?: string;
};

type StageStep = {
  id: string;
  title: string;
  body: ReactNode;
  highlight?: string;
  anchor?: Anchor;
  ctaLabel?: string;
  secondaryLabel?: string;
  scope?: string;
  sequence?: StepSequence[];
  waitFor?: WaitForConfig;
};

type Recommendation = {
  symbol: string;
  label: string;
  reason: string;
  why: string;
};

type TourState = {
  stage: StageId;
  step: number;
  done: boolean;
  suggestedSymbol: string | null;
  extraTips: Record<ExtraTipId, boolean>;
};

type SpotlightBox = {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: number;
};

const STORAGE_KEY = "aura_tour_state_v2";
const COMPACT_KEY = "aura_tour_compact_v1";
const STAGE_FLOW: StageId[] = ["welcome", "profile", "risk", "feed", "asset", "demo", "home", "completed"];
const DEFAULT_EXTRA_TIPS: Record<ExtraTipId, boolean> = { invest: false, simulator: false };
const SPOTLIGHT_PADDING = 18;

function defaultState(): TourState {
  return {
    stage: "welcome",
    step: 0,
    done: false,
    suggestedSymbol: null,
    extraTips: { ...DEFAULT_EXTRA_TIPS },
  };
}

function readState(): TourState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<TourState>;
    if (!parsed || typeof parsed !== "object") return defaultState();
    return {
      stage: (parsed.stage && STAGE_FLOW.includes(parsed.stage)) ? parsed.stage : "welcome",
      step: typeof parsed.step === "number" && Number.isFinite(parsed.step) ? parsed.step : 0,
      done: parsed.done === true,
      suggestedSymbol: typeof parsed.suggestedSymbol === "string" ? parsed.suggestedSymbol : null,
      extraTips: { ...DEFAULT_EXTRA_TIPS, ...(parsed.extraTips ?? {}) },
    };
  } catch {
    return defaultState();
  }
}

function persistState(state: TourState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore persistence errors
  }
}

const RECOMMENDATIONS: Record<RiskProfile | "default", Recommendation> = {
  Conservador: {
    symbol: "TLT",
    label: "Bonos del Tesoro (TLT)",
    reason: "Se mueve despacio y respeta niveles técnicos claros.",
    why: "Ideal para ver cómo una oportunidad conservadora mantiene movimientos moderados y objetivos cercanos.",
  },
  Moderado: {
    symbol: "AAPL",
    label: "Apple (AAPL)",
    reason: "Tendencia sólida con retrocesos manejables.",
    why: "Permite practicar cómo seguir una empresa líder con buena liquidez y señales frecuentes.",
  },
  Agresivo: {
    symbol: "NVDA",
    label: "NVIDIA (NVDA)",
    reason: "Volatilidad elevada pero con tendencias fuertes.",
    why: "Perfecta para comprender cómo se combinan confianza y riesgo en una acción de alto crecimiento.",
  },
  default: {
    symbol: "SPY",
    label: "S&P 500 (SPY)",
    reason: "ETF diversificado y fácil de seguir.",
    why: "Sirve para entender el panel general sin sobresaltos fuertes.",
  },
};

const RECOMMENDATION_BY_SYMBOL = Object.values(RECOMMENDATIONS).reduce<Record<string, Recommendation>>((acc, item) => {
  acc[item.symbol] = item;
  return acc;
}, {});

type StageContext = {
  recommended: Recommendation;
};

function buildStageSteps(stage: StageId, ctx: StageContext): StageStep[] {
  switch (stage) {
    case "welcome":
      return [
        {
          id: "intro",
          title: "Recorrido guiado de AURA",
          body: (
            <>
              <p>Te acompañaremos paso a paso para conocer las funciones clave. Es interactivo: vas a completar tu perfil, elegir una recomendación y practicarla en modo demo.</p>
              <p className="text-xs opacity-70 mt-2">Puedes salir cuando quieras, pero te recomendamos completarlo para aprovechar la app sin dudas.</p>
            </>
          ),
          anchor: "center",
          ctaLabel: "Empezar recorrido",
        },
        {
          id: "go-profile",
          title: "Primero, tu perfil base",
          body: (
            <p>Comencemos revisando tus datos personales y recordatorios. Así AURA adapta el tono, las alertas y las guías a tus necesidades.</p>
          ),
          anchor: "bottom-right",
          ctaLabel: "Ir a mi perfil",
        },
      ];
    case "profile":
      return [
        {
          id: "profile-overview",
          title: "Aquí ves tu resumen personal",
          body: <p>Confirma que tu correo y nombre estén correctos y aprovecha los accesos rápidos de esta tarjeta.</p>,
          anchor: "bottom-right",
          sequence: [
            {
              id: "overview-card",
              title: "Tu panel personal",
              body: <p>Aquí ves tu correo, ID y salud del perfil. Revísalo cada vez que entres.</p>,
              highlight: "[data-tour-target='profile-overview-section']",
              scope: "[data-tour-target='profile-overview-section']",
            },
            {
              id: "overview-coach",
              title: "Activa la ayuda guiada",
              body: <p>Usa el botón “Necesito ayuda simple” para mostrar o ocultar consejos rápidos.</p>,
              highlight: "[data-tour-target='profile-coach-toggle']",
              scope: "[data-tour-target='profile-overview-section']",
              waitFor: { event: "click", selector: "[data-tour-target='profile-coach-toggle']" },
            },
            {
              id: "overview-logout",
              title: "Cierra sesión con seguridad",
              body: <p>Cuando necesites salir, presiona “Cerrar sesión”. Te llevaremos al login de inmediato.</p>,
              highlight: "[data-tour-target='profile-logout']",
              scope: "[data-tour-target='profile-overview-section']",
            },
          ],
        },
        {
          id: "profile-favorite",
          title: "Personaliza tu activo favorito",
          body: <p>Tu favorito quedará destacado en Inicio para volver rápido cuando lo necesites.</p>,
          anchor: "bottom-right",
          sequence: [
            {
              id: "favorite-section",
              title: "Configuración del favorito",
              body: <p>Este bloque te permite elegir el símbolo que seguirás de cerca.</p>,
              highlight: "[data-tour='profile-favorite']",
              scope: "[data-tour='profile-favorite']",
            },
            {
              id: "favorite-open",
              title: "Haz clic en “Elegir”",
              body: <p>Presiona el botón para abrir el buscador de símbolos.</p>,
              highlight: "[data-tour-target='favorite-choose']",
              scope: "[data-tour='profile-favorite']",
              waitFor: { event: "aura:fav-opened", selector: "[data-tour='profile-favorite']" },
            },
            {
              id: "favorite-picked",
              title: "Selecciona un símbolo",
              body: <p>Elige un activo del modal para continuar. El tour avanzará automáticamente.</p>,
              highlight: "[data-tour='favorite-modal']",
              scope: "[data-tour='favorite-modal']",
              anchor: "top-center",
              waitFor: { event: "aura:fav-selected", selector: "[data-tour='profile-favorite']" },
            },
          ],
        },
        {
          id: "profile-home-filter",
          title: "Define tu clase preferida",
          body: <p>Configura un filtro inicial para que Inicio muestre primero los activos que te interesan.</p>,
          anchor: "bottom-right",
          sequence: [
            {
              id: "home-filter-section",
              title: "Filtro predeterminado",
              body: <p>Este bloque controla qué clase de activo verás por defecto en Inicio.</p>,
              highlight: "[data-tour='profile-home-filter']",
              scope: "[data-tour='profile-home-filter']",
            },
            {
              id: "home-filter-select",
              title: "Elige la clase",
              body: <p>Abre la lista y selecciona la clase de activo que quieres ver por defecto.</p>,
              highlight: "[data-tour-target='home-filter-select']",
              scope: "[data-tour='profile-home-filter']",
              waitFor: { event: "change", selector: "[data-tour-target='home-filter-select']" },
            },
            {
              id: "home-filter-save",
              title: "Guarda tu filtro",
              body: <p>Confirma con “Guardar preferencia” para aplicar el filtro en tu dashboard.</p>,
              highlight: "[data-tour-target='home-filter-save']",
              scope: "[data-tour='profile-home-filter']",
              waitFor: { event: "click", selector: "[data-tour-target='home-filter-save']" },
            },
          ],
        },
        {
          id: "profile-alerts",
          title: "Activa recordatorios y tips",
          body: <p>Usa los interruptores para decidir qué resúmenes, alertas y tips quieres ver.</p>,
          anchor: "bottom-right",
          sequence: [
            {
              id: "alerts-section",
              title: "Panel de recordatorios",
              body: <p>En este bloque administras correos, alertas de volatilidad y tips en la app.</p>,
              highlight: "[data-tour='profile-alerts']",
              scope: "[data-tour='profile-alerts']",
            },
            {
              id: "alerts-toggle",
              title: "Activa un recordatorio",
              body: <p>Haz clic en el interruptor para activar o desactivar este recordatorio.</p>,
              highlight: "[data-tour-target='alerts-weekly']",
              scope: "[data-tour='profile-alerts']",
              waitFor: { event: "click", selector: "[data-tour-target='alerts-weekly']" },
            },
            {
              id: "alerts-more",
              title: "Personaliza los demás",
              body: <p>Ajusta el resto de opciones según necesites. Puedes volver a esta sección cuando quieras.</p>,
              highlight: "[data-tour-target='profile-alerts-grid']",
              scope: "[data-tour='profile-alerts']",
            },
          ],
        },
        {
          id: "profile-checklist",
          title: "Haz check en tu progreso",
          body: <p>Usa esta lista como brújula para mantener tu cuenta saludable.</p>,
          anchor: "bottom-right",
          sequence: [
            {
              id: "checklist-section",
              title: "Revisa tu checklist",
              body: <p>Aquí ves los pasos clave para mantener tu cuenta protegida y al día.</p>,
              highlight: "[data-tour='profile-checklist']",
              scope: "[data-tour='profile-checklist']",
            },
            {
              id: "checklist-mark",
              title: "Marca un paso",
              body: <p>Marca la casilla cuando completes la tarea. Así actualizamos tu progreso.</p>,
              highlight: "[data-tour-target='checklist-first']",
              scope: "[data-tour='profile-checklist']",
              waitFor: { event: "change", selector: "[data-tour-target='checklist-first-checkbox']" },
            },
            {
              id: "checklist-cta",
              title: "Accede rápido",
              body: <p>Usa el botón de cada fila para ir directo a la sección y completar los pendientes.</p>,
              highlight: "[data-tour-target='profile-checklist-grid']",
              scope: "[data-tour='profile-checklist']",
            },
          ],
          ctaLabel: "Listo, continuar",
        },
        {
          id: "profile-next",
          title: "Ahora, tu perfil de inversión",
          body: (
            <p>Con tus datos base listos, pasemos al cuestionario de riesgo. Definiremos qué tan conservador o agresivo es tu estilo.</p>
          ),
          anchor: "bottom-right",
          ctaLabel: "Ir al perfil de inversión",
        },
      ];
    case "risk":
      return [
        {
          id: "risk-form",
          title: "Cuéntanos cómo inviertes",
          body: (
            <p>Llena cada campo con tus datos reales y presiona “Calcular y guardar”. Esa acción actualiza el perfil que usamos para sugerirte señales.</p>
          ),
          highlight: "[data-tour='risk-form']",
          anchor: "bottom-right",
        },
        {
          id: "risk-summary",
          title: "Resultado y recomendaciones",
          body: (
            <p>Revisa el puntaje, el perfil sugerido y las acciones concretas. Si cambiaste datos hace poco, vuelve a presionar “Calcular y guardar”.</p>
          ),
          highlight: "[data-tour='risk-summary']",
          anchor: "bottom-right",
        },
        {
          id: "risk-signals",
          title: "Filtramos el feed por ti",
          body: (
            <p>Mira cuántas señales pasaron tu filtro y abre las aptas para leer el detalle. Cuando quieras practicar, lanza “Simular con IA”.</p>
          ),
          highlight: "[data-tour='risk-signals']",
          anchor: "bottom-right",
          ctaLabel: "Entendido",
        },
        {
          id: "risk-next",
          title: "Hora de escoger una oportunidad",
          body: (
            <p>Con tu estilo definido, vamos al feed de recomendaciones para elegir la idea que mejor encaja contigo.</p>
          ),
          anchor: "bottom-right",
          ctaLabel: "Ir al feed",
        },
      ];
    case "feed":
      return [
        {
          id: "feed-filters",
          title: "Explora según tu objetivo",
          body: (
            <p>Mueve el slider de certeza, ajusta el periodo, cambia la clase y usa los botones de acción. Cuando termines, pulsa “Refrescar” o vuelve a “Usar mi perfil”.</p>
          ),
          highlight: "[data-tour='feed-filters']",
          anchor: "bottom-right",
        },
        {
          id: "feed-cards",
          title: "Cada tarjeta explica la señal",
          body: (
            <p>Abre cada tarjeta para revisar símbolo, stops, certeza y narrativa. Desde aquí puedes exportar el listado o enviarlo al simulador.</p>
          ),
          highlight: "[data-tour='feed-cards']",
          anchor: "bottom-right",
        },
        {
          id: "feed-choose",
          title: "Elegiremos una guía para practicar",
          body: (
            <>
              <p>Para tu perfil, sugerimos revisar <strong>{ctx.recommended.label}</strong>. {ctx.recommended.reason} Selecciónala para profundizar y ponerla en práctica.</p>
              <p className="text-xs opacity-70 mt-2">{ctx.recommended.why}</p>
            </>
          ),
          anchor: "bottom-right",
          ctaLabel: `Abrir ${ctx.recommended.symbol}`,
        },
      ];
    case "asset":
      return [
        {
          id: "asset-header",
          title: "Identifica el activo",
          body: (
            <p>Confirma el símbolo, su clase y la descripción. Si no es el activo correcto, vuelve atrás antes de continuar.</p>
          ),
          highlight: "[data-tour='asset-header']",
          anchor: "bottom-right",
        },
        {
          id: "asset-price",
          title: "Precio en vivo y variación",
          body: (
            <p>Observa el ticker en tiempo real y prueba cambiar el rango para ver cómo se mueve el porcentaje.</p>
          ),
          highlight: "[data-tour='asset-price']",
          anchor: "bottom-right",
        },
        {
          id: "asset-chart",
          title: "Gráfica paso a paso",
          body: (
            <p>Usa los botones de rango para ver distintos horizontes y sigue la línea punteada que marca el objetivo sugerido.</p>
          ),
          highlight: "[data-tour='asset-chart']",
          anchor: "bottom-right",
        },
        {
          id: "asset-trade",
          title: "Simula entradas y salidas",
          body: (
            <p>Selecciona Long o Short, ajusta cantidad y pulsa “Abrir posición”. Cierra desde la misma lista cuando quieras evaluar el resultado.</p>
          ),
          highlight: "[data-tour='asset-trade']",
          anchor: "bottom-right",
        },
        {
          id: "asset-indicator",
          title: "Lee la interpretación del modelo",
          body: (
            <p>Revisa certeza, sigma, stops y márgenes. Estas métricas te orientan sobre cómo manejar objetivo y protección.</p>
          ),
          highlight: "[data-tour='asset-indicator']",
          anchor: "bottom-right",
        },
        {
          id: "asset-news",
          title: "Noticias que pueden mover el precio",
          body: (
            <p>Abre los titulares destacados para saber qué eventos podrían impactar este símbolo antes de operar.</p>
          ),
          highlight: "[data-tour='asset-news']",
          anchor: "bottom-right",
          ctaLabel: "Listo",
        },
        {
          id: "asset-next",
          title: "Practiquemos la recomendación",
          body: (
            <p>Pasemos al modo demo para ejecutar esta idea sin arriesgar dinero y entender cómo impacta en tu balance.</p>
          ),
          anchor: "bottom-right",
          ctaLabel: "Ir al modo demo",
        },
      ];
    case "demo":
      return [
        {
          id: "demo-ticket",
          title: "Ticket de práctica",
          body: (
            <p>Introduce el símbolo sugerido, ajusta monto o cantidad y presiona “Abrir”. Cada operación se guarda para que midas tu PnL.</p>
          ),
          highlight: "[data-tour='paper-ticket']",
          anchor: "bottom-right",
        },
        {
          id: "demo-positions",
          title: "Sigue tus posiciones",
          body: (
            <p>Monitorea las operaciones abiertas y cierra con el botón correspondiente para ver el resultado realizado al instante.</p>
          ),
          highlight: "[data-tour='paper-positions']",
          anchor: "bottom-right",
        },
        {
          id: "demo-chart",
          title: "Historial de resultados",
          body: (
            <p>Analiza la barra y la línea acumulada para evaluar cómo evoluciona tu PnL realizado y decidir ajustes en tu tamaño de posición.</p>
          ),
          highlight: "[data-tour='paper-chart']",
          anchor: "bottom-right",
          ctaLabel: "Entendido",
        },
        {
          id: "demo-next",
          title: "Resumen final en tu inicio",
          body: (
            <p>Regresemos al home para ver cómo se refleja tu actividad y planificar los siguientes pasos.</p>
          ),
          anchor: "bottom-right",
          ctaLabel: "Ir al home",
        },
      ];
    case "home":
      return [
        {
          id: "home-summary",
          title: "Tu dashboard en contexto",
          body: (
            <p>Desde esta tarjeta accedes rápido a tu perfil de riesgo, capital demo y solicitudes IA. Usa los botones para entrar a cada módulo.</p>
          ),
          highlight: "[data-tour='home-summary']",
          anchor: "bottom-right",
        },
        {
          id: "home-watch",
          title: "Vigila lo que más te importa",
          body: (
            <p>Cambia el símbolo desde la lista, revisa el precio en vivo y observa la señal actual. Ideal para conectar la teoría con tu práctica diaria.</p>
          ),
          highlight: "[data-tour='home-watch']",
          anchor: "bottom-right",
        },
        {
          id: "home-finish",
          title: "¡Recorrido completado!",
          body: (
            <>
              <p>Ya conoces el flujo completo: perfil personal, perfil de inversión, selección de ideas y práctica en demo.</p>
              <p className="text-sm opacity-80 mt-2">Resta explorar funcionalidades como el simulador de metas y las solicitudes de predicción. Cuando entres por primera vez, recibirás una mini-guía igual de interactiva.</p>
            </>
          ),
          anchor: "bottom-right",
          ctaLabel: "Terminar tour",
        },
      ];
    case "completed":
      return [];
    default:
      return [];
  }
}

type ExtraTip = {
  id: ExtraTipId;
  match: (path: string) => boolean;
  title: string;
  body: ReactNode;
  highlight?: string;
  anchor?: Anchor;
  scope?: string;
  waitFor?: WaitForConfig;
};

const EXTRA_TIPS: ExtraTip[] = [
  {
    id: "invest",
    match: (path) => path.startsWith("/invest"),
    title: "Pide una predicción puntual",
    body: (
      <p>Completa el formulario con símbolo, monto y fecha. AURA genera una señal dedicada y la guarda para que la revises luego.</p>
    ),
    highlight: "[data-tour='invest-form']",
    anchor: "bottom-right",
  },
  {
    id: "simulator",
    match: (path) => path.startsWith("/simulator"),
    title: "Simula metas de largo plazo",
    body: (
      <p>Configura aportes, horizonte y riesgo para ver escenarios probables. Ideal para practicar hábitos antes de invertir dinero real.</p>
    ),
    highlight: "[data-tour='simulator-panel']",
    anchor: "bottom-right",
  },
];

function getNextStage(current: StageId): StageId {
  const idx = STAGE_FLOW.indexOf(current);
  if (idx === -1) return "completed";
  return STAGE_FLOW[Math.min(STAGE_FLOW.length - 1, idx + 1)];
}

export default function OnboardingTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);
  const [state, setState] = useState<TourState>(() => readState());
  const [riskProfile, setRiskProfile] = useState<RiskProfile | null>(null);
  const [subStepIndex, setSubStepIndex] = useState(0);
  const handlePrimaryRef = useRef<() => void>(() => {});
  const scopeRef = useRef<HTMLElement | null>(null);
  const highlightRef = useRef<HTMLElement | null>(null);
  const spotlightStyleRef = useRef<HTMLStyleElement | null>(null);
  const [spotlight, setSpotlight] = useState<SpotlightBox | null>(null);
  const [waitingAction, setWaitingAction] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => setIsClient(true), []);

  useEffect(() => {
    if (!isClient) return;
    if (spotlightStyleRef.current && spotlightStyleRef.current.isConnected) return;
    const existing = document.getElementById("aura-tour-spotlight-style") as HTMLStyleElement | null;
    const styleEl = existing ?? document.createElement("style");
    if (!existing) {
      styleEl.id = "aura-tour-spotlight-style";
      document.head.appendChild(styleEl);
    }
    spotlightStyleRef.current = styleEl;
    return () => {
      if (spotlightStyleRef.current) {
        spotlightStyleRef.current.remove();
        spotlightStyleRef.current = null;
      }
    };
  }, [isClient]);

  useEffect(() => {
    if (!isClient) return;
    // Restaurar preferencia de modo compacto
    try {
      const raw = window.localStorage.getItem(COMPACT_KEY);
      if (raw != null) {
        setCollapsed(raw === "1");
      }
    } catch { /* ignore */ }
    persistState(state);
  }, [state, isClient]);

  useEffect(() => {
    setSubStepIndex(0);
  }, [state.stage, state.step]);

  useEffect(() => {
    if (!isClient) return;
    function handleStart(event: Event) {
      const detail = (event as CustomEvent<{ stage?: StageId | null }>).detail;
      const stage = detail?.stage && STAGE_FLOW.includes(detail.stage) ? detail.stage : "welcome";
      setState({
        ...defaultState(),
        stage,
        done: false,
      });
    }
    window.addEventListener("aura-tour:start", handleStart as EventListener);
    return () => window.removeEventListener("aura-tour:start", handleStart as EventListener);
  }, [isClient]);

  useEffect(() => {
    if (!isClient) return;
    try {
      const profile = loadRiskProfile()?.profile ?? null;
      setRiskProfile(profile);
    } catch {
      setRiskProfile((prev) => prev ?? null);
    }
  }, [isClient, state.stage, state.step]);

  const recommended = useMemo<Recommendation>(() => {
    if (state.suggestedSymbol) {
      return RECOMMENDATION_BY_SYMBOL[state.suggestedSymbol] ?? RECOMMENDATIONS[riskProfile ?? "default"];
    }
    return RECOMMENDATIONS[riskProfile ?? "default"];
  }, [riskProfile, state.suggestedSymbol]);

  const steps = useMemo(() => buildStageSteps(state.stage, { recommended }), [state.stage, recommended]);
  const currentStep = steps[state.step] ?? null;

  const pendingExtraTip = useMemo<ExtraTip | null>(() => {
    if (!state.done) return null;
    for (const tip of EXTRA_TIPS) {
      if (!state.extraTips[tip.id] && tip.match(pathname)) {
        return tip;
      }
    }
    return null;
  }, [state.done, state.extraTips, pathname]);
  const sequence = useMemo(() => (pendingExtraTip ? null : currentStep?.sequence ?? null), [currentStep, pendingExtraTip]);
  const sequenceLength = sequence?.length ?? 0;
  const boundedSubIndex = sequenceLength > 0 ? Math.min(subStepIndex, sequenceLength - 1) : 0;
  const activeSequence = sequenceLength > 0 ? sequence?.[boundedSubIndex] ?? null : null;
  const showBack =
    !state.done &&
    !pendingExtraTip &&
    (subStepIndex > 0 || state.step > 0 || STAGE_FLOW.indexOf(state.stage) > 0);

  useEffect(() => {
    if (sequenceLength === 0 && subStepIndex !== 0) {
      setSubStepIndex(0);
    } else if (sequenceLength > 0 && subStepIndex > sequenceLength - 1) {
      setSubStepIndex(sequenceLength - 1);
    }
  }, [sequenceLength, subStepIndex]);
  const waitConfig = pendingExtraTip?.waitFor ?? activeSequence?.waitFor ?? currentStep?.waitFor ?? null;
  const waitSignature = waitConfig ? `${waitConfig.event}::${waitConfig.selector}` : null;

  // Progreso dentro de la etapa (o de la secuencia si aplica)
  const progress = useMemo(() => {
    if (pendingExtraTip) return null;
    const total = sequenceLength > 0 ? sequenceLength : steps.length;
    if (!total || total <= 1) return null;
    const activeIndex = sequenceLength > 0 ? boundedSubIndex : state.step;
    return {
      label: `${Math.min(activeIndex + 1, total)}/${total}`,
      total,
      activeIndex,
    } as const;
  }, [pendingExtraTip, sequenceLength, steps.length, boundedSubIndex, state.step]);

  useEffect(() => {
    if (!isClient) return;
    const selector = pendingExtraTip?.highlight ?? activeSequence?.highlight ?? currentStep?.highlight;
    if (!selector) {
      setSpotlight(null);
      if (highlightRef.current) {
        highlightRef.current.classList.remove("aura-tour__highlight");
        highlightRef.current.classList.remove("aura-tour__highlight--attention");
        highlightRef.current = null;
      }
      return;
    }

    let element: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let scrollRaf: number | null = null;
    let searchTimeout: number | null = null;
    let attempts = 0;

    const clamp = (value: number) => Math.max(value, 0);

    const measure = () => {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) return;

      const computed = window.getComputedStyle(element);
      const radiusTokens = computed.borderRadius.split(" ");
      const baseRadius = radiusTokens.reduce((max, token) => {
        const value = Number.parseFloat(token);
        return Number.isFinite(value) ? Math.max(max, value) : max;
      }, 0);

      const padding = SPOTLIGHT_PADDING;
      const next: SpotlightBox = {
        top: clamp(rect.top - padding),
        left: clamp(rect.left - padding),
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
        radius: baseRadius + padding,
      };

      setSpotlight((prev) => {
        if (
          prev &&
          Math.abs(prev.top - next.top) < 0.5 &&
          Math.abs(prev.left - next.left) < 0.5 &&
          Math.abs(prev.width - next.width) < 0.5 &&
          Math.abs(prev.height - next.height) < 0.5 &&
          Math.abs(prev.radius - next.radius) < 0.5
        ) {
          return prev;
        }
        return next;
      });
    };

    const handleScroll = () => {
      if (scrollRaf != null) window.cancelAnimationFrame(scrollRaf);
      scrollRaf = window.requestAnimationFrame(measure);
    };

    const activateHighlight = (node: HTMLElement) => {
      element = node;
      highlightRef.current = node;
      node.classList.add("aura-tour__highlight");
      measure();
      try {
        const computed = window.getComputedStyle(node);
        const isFixed = computed.position === "fixed";
        const noSnap = node.getAttribute("data-tour-nosnap") === "1";
        if (!isFixed && !noSnap) {
          node.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      } catch {
        // ignore scroll failures
      }
      if (typeof window.ResizeObserver === "function") {
        resizeObserver = new window.ResizeObserver(() => measure());
        resizeObserver.observe(node);
      }
    };

    const findHighlight = () => {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) {
        if (attempts < 12) {
          attempts += 1;
          searchTimeout = window.setTimeout(findHighlight, 140);
        }
        return;
      }
      activateHighlight(node);
    };

    const raf = window.requestAnimationFrame(findHighlight);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(raf);
      if (scrollRaf != null) window.cancelAnimationFrame(scrollRaf);
      if (searchTimeout != null) window.clearTimeout(searchTimeout);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", measure);
      if (resizeObserver) resizeObserver.disconnect();
      if (element) {
        element.classList.remove("aura-tour__highlight");
        element.classList.remove("aura-tour__highlight--attention");
      }
      if (highlightRef.current === element) {
        highlightRef.current = null;
      }
      setSpotlight(null);
    };
  }, [
    currentStep?.highlight,
    activeSequence?.highlight,
    pendingExtraTip?.highlight,
    pathname,
    isClient,
    waitSignature,
  ]);

  useEffect(() => {
    const node = highlightRef.current;
    if (!node) return;
    if (waitingAction) {
      node.classList.add("aura-tour__highlight--attention");
    } else {
      node.classList.remove("aura-tour__highlight--attention");
    }
  }, [waitingAction]);

  useEffect(() => {
    if (!spotlightStyleRef.current) return;
    if (!spotlight) {
      spotlightStyleRef.current.textContent = "";
      return;
    }
    spotlightStyleRef.current.textContent = `
.aura-tour__spotlight[data-active="1"] {
  top: ${spotlight.top}px;
  left: ${spotlight.left}px;
  width: ${spotlight.width}px;
  height: ${spotlight.height}px;
  border-radius: ${spotlight.radius}px;
}
`.trim();
  }, [spotlight]);

  useEffect(() => {
    if (!isClient) return;
    const scopeSelector = pendingExtraTip?.scope ?? activeSequence?.scope ?? currentStep?.scope;
    if (scopeRef.current) {
      scopeRef.current.classList.remove("aura-tour__scope-highlight");
      scopeRef.current = null;
    }
    if (!scopeSelector) return;
    const node = document.querySelector<HTMLElement>(scopeSelector);
    if (!node) return;
    node.classList.add("aura-tour__scope-highlight");
    scopeRef.current = node;
    return () => {
      if (scopeRef.current === node) {
        node.classList.remove("aura-tour__scope-highlight");
        scopeRef.current = null;
      }
    };
  }, [isClient, pendingExtraTip?.scope, activeSequence?.scope, currentStep?.scope]);

  useEffect(() => {
    if (!waitSignature) {
      setWaitingAction(false);
      return;
    }
    setWaitingAction(true);
  }, [waitSignature, setWaitingAction]);


  const anchor =
    pendingExtraTip?.anchor ??
    activeSequence?.anchor ??
    currentStep?.anchor ??
    "bottom-right";
  const title =
    pendingExtraTip?.title ??
    activeSequence?.title ??
    currentStep?.title ??
    "";
  const currentTitleForFooter = activeSequence?.title ?? currentStep?.title ?? "";
  const body =
    pendingExtraTip?.body ??
    activeSequence?.body ??
    currentStep?.body ??
    null;
  const ctaLabel =
    pendingExtraTip?.body != null
      ? "Entendido"
      : activeSequence && boundedSubIndex < sequenceLength - 1
        ? "Siguiente"
        : currentStep?.ctaLabel;
  const showSecondary = !state.done && !pendingExtraTip;
  const secondaryLabel = currentStep?.secondaryLabel ?? "Saltar tour";
  const symbolForRouting = state.suggestedSymbol ?? recommended.symbol;
  const primaryDisabled = waitingAction;

  function navigateToStage(stage: StageId, symbol?: string) {
    let path: string | null = null;
    if (stage === "profile") path = "/profile?tour=1";
    else if (stage === "risk") path = "/risk?tour=1";
    else if (stage === "feed") path = "/feed?tour=1";
    else if (stage === "asset") {
      const sym = symbol ?? state.suggestedSymbol ?? recommended.symbol;
      path = sym ? `/asset/${sym}?tour=1` : null;
    } else if (stage === "demo") path = "/paper?tour=1";
    else if (stage === "home") path = "/home?tour=1";
    if (path) {
      router.push(path);
    }
  }

  function markDone() {
    setState((prev) => ({
      ...prev,
      stage: "completed",
      done: true,
      step: 0,
      extraTips: { ...DEFAULT_EXTRA_TIPS, ...prev.extraTips },
    }));
  }

  function handleSecondary() {
    if (waitingAction) return;
    markDone();
  }

  function handleSkipStep() {
    // Avanza al siguiente subpaso o paso, ignorando waitFor.
    if (sequenceLength > 0 && boundedSubIndex < sequenceLength - 1) {
      setSubStepIndex((prev) => Math.min(prev + 1, sequenceLength - 1));
      setWaitingAction(false);
      return;
    }
    setWaitingAction(false);
    handlePrimaryRef.current();
  }

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try { window.localStorage.setItem(COMPACT_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }

  function handlePrimary() {
    if (waitingAction) return;
    if (pendingExtraTip) {
      setState((prev) => ({
        ...prev,
        extraTips: { ...prev.extraTips, [pendingExtraTip.id]: true },
      }));
      return;
    }

    if (sequenceLength > 0 && subStepIndex < sequenceLength - 1) {
      setSubStepIndex((prev) => Math.min(prev + 1, sequenceLength - 1));
      return;
    }

    if (!currentStep) return;

    if (state.stage === "welcome" && currentStep.id === "go-profile") {
      setState((prev) => ({ ...prev, stage: "profile", step: 0 }));
      navigateToStage("profile", symbolForRouting);
      return;
    }

    if (state.stage === "profile" && currentStep.id === "profile-next") {
      setState((prev) => ({ ...prev, stage: "risk", step: 0 }));
      navigateToStage("risk", symbolForRouting);
      return;
    }

    if (state.stage === "risk" && currentStep.id === "risk-next") {
      setState((prev) => ({ ...prev, stage: "feed", step: 0 }));
      navigateToStage("feed", symbolForRouting);
      return;
    }

    if (state.stage === "feed" && currentStep.id === "feed-choose") {
      const sym = symbolForRouting;
      setState((prev) => ({
        ...prev,
        stage: "asset",
        step: 0,
        suggestedSymbol: sym,
      }));
      navigateToStage("asset", sym);
      return;
    }

    if (state.stage === "asset" && currentStep.id === "asset-next") {
      setState((prev) => ({ ...prev, stage: "demo", step: 0 }));
      navigateToStage("demo", symbolForRouting);
      return;
    }

    if (state.stage === "demo" && currentStep.id === "demo-next") {
      setState((prev) => ({ ...prev, stage: "home", step: 0 }));
      navigateToStage("home", symbolForRouting);
      return;
    }

    if (state.stage === "home" && currentStep.id === "home-finish") {
      markDone();
      return;
    }

    if (state.step < steps.length - 1) {
      setState((prev) => ({ ...prev, step: prev.step + 1 }));
      return;
    }

    const nextStage = getNextStage(state.stage);
    if (nextStage === "completed") {
      markDone();
    } else {
      setState((prev) => ({ ...prev, stage: nextStage, step: 0 }));
      navigateToStage(nextStage, symbolForRouting);
    }
  }

  handlePrimaryRef.current = handlePrimary;

  function handleBack() {
    if (waitingAction) return;
    if (pendingExtraTip || state.done) return;
    if (sequenceLength > 0 && subStepIndex > 0) {
      setSubStepIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (state.step > 0) {
      setState((prev) => ({ ...prev, step: prev.step - 1 }));
      return;
    }
    const idx = STAGE_FLOW.indexOf(state.stage);
    if (idx <= 0) return;
    const prevStage = STAGE_FLOW[idx - 1];
    const prevSteps = buildStageSteps(prevStage, { recommended });
    const prevStepIndex = Math.max(0, prevSteps.length - 1);
    const symbol = symbolForRouting;
    setState((prev) => ({
      ...prev,
      stage: prevStage,
      step: prevStepIndex,
    }));
    navigateToStage(prevStage, symbol);
  }

  useEffect(() => {
    if (!isClient) return;
    if (!waitConfig) return;
    const handler = (event: Event) => {
      if (!waitingAction) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const match = target.closest(waitConfig.selector);
      if (!match) return;
      setWaitingAction(false);
      if (sequenceLength > 0 && subStepIndex < sequenceLength - 1) {
        setSubStepIndex((prev) => Math.min(prev + 1, sequenceLength - 1));
      } else {
        handlePrimaryRef.current();
      }
    };
    document.addEventListener(waitConfig.event, handler, true);
    return () => document.removeEventListener(waitConfig.event, handler, true);
  }, [isClient, waitConfig, waitSignature, waitingAction, sequenceLength, subStepIndex, setWaitingAction]);

  if (!isClient) return null;

  if (state.done && !pendingExtraTip) return null;

  const cardKey = `${state.stage}:${state.step}:${boundedSubIndex}:${pendingExtraTip ? "extra" : "main"}`;
  const overlay = (
    <>
      {spotlight ? <div className="aura-tour__spotlight" data-active="1" /> : <div className="aura-tour__backdrop" />}
      <div className="aura-tour__panel" data-anchor={anchor}>
        <div key={cardKey} className="aura-tour__card" data-collapsed={collapsed ? "1" : undefined}>
          <div className="aura-tour__header">
            <div className="aura-tour__header-row">
              <div>
                <div className="aura-tour__badge">Guía interactiva · AURA</div>
                <h2 className="aura-tour__title">{title}</h2>
              </div>
              <button type="button" className="aura-tour__minimize" onClick={toggleCollapsed}>
                {collapsed ? "Expandir" : "Compactar"}
              </button>
            </div>
          </div>
          <div className="aura-tour__body">{body}</div>
          <div className="aura-tour__footer">
            <div className="aura-tour__footer-left">
              {progress && (
                <div className="aura-tour__progress" aria-label={`Progreso ${progress.label}`}>
                  <div className="aura-tour__dots" role="list">
                    {Array.from({ length: progress.total }).map((_, i) => (
                      <span
                        key={i}
                        role="listitem"
                        className={`aura-tour__dot${i === progress.activeIndex ? " is-active" : ""}`}
                        aria-current={i === progress.activeIndex ? "step" : undefined}
                      />
                    ))}
                  </div>
                  <span className="aura-tour__progress-label">{progress.label}</span>
                  {currentTitleForFooter && (
                    <span className="aura-tour__step-title" title={currentTitleForFooter}>
                      · Paso {Math.min((progress?.activeIndex ?? 0) + 1, progress?.total ?? 1)}: {currentTitleForFooter}
                    </span>
                  )}
                </div>
              )}
              {showBack && (
                <button
                  type="button"
                  className="aura-tour__back"
                  onClick={handleBack}
                  disabled={waitingAction}
                >
                  Anterior
                </button>
              )}
              {!pendingExtraTip && (
                <button type="button" className="aura-tour__skip-step" onClick={handleSkipStep} disabled={waitingAction}>
                  Omitir paso
                </button>
              )}
            </div>
            <div className="aura-tour__footer-actions">
              {showSecondary && (
                <button
                  type="button"
                  className="aura-tour__secondary"
                  onClick={handleSecondary}
                  disabled={waitingAction}
                  data-locked={waitingAction ? "1" : undefined}
                >
                  {secondaryLabel}
                </button>
              )}
              <button
                type="button"
                className="aura-tour__primary"
                onClick={handlePrimary}
                disabled={primaryDisabled}
                data-locked={primaryDisabled ? "1" : undefined}
              >
                {ctaLabel ?? "Continuar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(overlay, document.body);
}
