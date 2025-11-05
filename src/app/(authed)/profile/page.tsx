"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, logout } from "@/lib/auth";
import SymbolAvatar from "@/components/SymbolAvatar";
import { notify } from "@/lib/notify";
import SymbolPicker from "@/components/SymbolPicker";

type Sess = {
  user_id: string;
  email: string;
  expiresAt?: number; // epoch seconds
};

function mask(s?: string, keep = 4) {
  if (!s) return "";
  if (s.length <= keep * 2) return s;
  return `${s.slice(0, keep)}.${s.slice(-keep)}`;
}

function secsToHuman(secs?: number) {
  if (!secs) return "-";
  const now = Math.floor(Date.now() / 1000);
  const d = secs - now;
  if (d <= 0) return "expirado";
  const m = Math.floor(d / 60);
  if (m < 1) return `${d}s`;
  const h = Math.floor(m / 60);
  if (h < 1) return `${m}m`;
  const r = m % 60;
  return `${h}h ${r}m`;
}

const PROFILE_PREFS_KEY = "aura_profile_prefs";
const PROFILE_CHECKLIST_KEY = "aura_profile_check";
const FAVORITE_ASSET_KEY = "aura_favorite_asset";
const PREF_CLASS_KEY = "aura_pref_class";

const defaultPrefs = {
  weeklyDigest: true,
  marketAlerts: true,
  learningTips: true,
};

type PrefKey = keyof typeof defaultPrefs;

const prefCopy: Record<
  PrefKey,
  { title: string; detail: string; onMsg: string; offMsg: string }
> = {
  weeklyDigest: {
    title: "Resumen semanal por correo",
    detail: "Cada viernes recibes un correo corto con movimientos y oportunidades simples.",
    onMsg: "Activaste el resumen semanal.",
    offMsg: "Desactivaste el resumen semanal.",
  },
  marketAlerts: {
    title: "Alertas de volatilidad",
    detail: "Te avisamos cuando el mercado se mueve mas de 3% en el dia para reaccionar con tiempo.",
    onMsg: "Alertas de volatilidad activadas.",
    offMsg: "Alertas de volatilidad desactivadas.",
  },
  learningTips: {
    title: "Tips dentro de la app",
    detail: "Muestra mensajes breves en paginas clave para guiarte sin tecnicismos.",
    onMsg: "Guia en pantalla activada.",
    offMsg: "Guia en pantalla desactivada.",
  },
};

type ChecklistItem = {
  id: string;
  title: string;
  detail: string;
  href?: string;
  ctaLabel?: string;
};

const checklistItems: ChecklistItem[] = [
  {
    id: "riskProfile",
    title: "Actualizar perfil de inversion",
    detail: "Completa el asistente de riesgo para adaptar sugerencias a tu estilo.",
    href: "/risk",
    ctaLabel: "Ir al asistente",
  },
  {
    id: "enableAlerts",
    title: "Configurar alertas de mercado",
    detail: "Activa avisos para moverte cuando los precios se aceleren o corrijan.",
    href: "/home",
    ctaLabel: "Abrir panel en vivo",
  },
  {
    id: "practicePaper",
    title: "Practicar con cuenta simulada",
    detail: "Entrena estrategias en modo paper antes de usar dinero real.",
    href: "/paper",
    ctaLabel: "Ir a cuenta paper",
  },
];

const defaultChecklistState = checklistItems.reduce<Record<string, boolean>>((acc, item) => {
  acc[item.id] = false;
  return acc;
}, {});

const coachTips = [
  {
    title: "Revisa tus datos basicos",
    detail: "Confirma que el correo y el nombre coinciden con tus documentos. Evita demoras en retiros.",
  },
  {
    title: "Define un recordatorio clave",
    detail: "Activa al menos un recordatorio para que la app te avise cuando debas revisar tu plan.",
  },
  {
    title: "Marca avances en el checklist",
    detail: "Cada tarea completada sube tu salud de perfil y refuerza el habito de seguimiento.",
  },
  {
    title: "Explora sin miedo",
    detail: "Usa la cuenta paper y el simulador para aprender conceptos sin arriesgar dinero real.",
  },
];

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sess, setSess] = useState<Sess | null>(null);
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>(defaultPrefs);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => ({ ...defaultChecklistState }));
  const [coachMode, setCoachMode] = useState(false);
  const [fav, setFav] = useState<string>("");
  const [prefClass, setPrefClass] = useState<"all"|"crypto"|"forex"|"equity"|"etf"|"index">('all');
  const [showFavPicker, setShowFavPicker] = useState(false);
  const forcePick = (searchParams?.get("tour") === "1");
  const SUGGESTIONS: string[] = [
    "BTC-USD","ETH-USD","LTC-USD","LINK-USD","ADA-USD","SOL-USD","DOGE-USD","XRP-USD","BNB-USD",
    "SPY","QQQ","TLT","GLD","DIA","IWM","EEM","HYG","XLK","XLE","XLF","XLV","XLY","XLI","XLP","XLB","XLU",
    "AAPL","MSFT","TSLA","AMZN","NVDA","META","GOOG","GOOGL",
    "EURUSD=X","USDJPY=X","GBPUSD=X","USDCAD=X",
  ];

  // Carga sesion para mostrar datos (el guard de (authed) ya protege la ruta)
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await getSession();
      if (!alive) return;
      setSess(s ? { user_id: s.user_id, email: s.email, expiresAt: s.expiresAt } : null);
    })();
    return () => { alive = false; };
  }, []);

  // Carga y persistencia de activo favorito
  useEffect(() => {
    try { const raw = localStorage.getItem(FAVORITE_ASSET_KEY); if (raw) setFav(String(raw)); } catch { /* noop */ }
    try { const cls = localStorage.getItem(PREF_CLASS_KEY) as typeof prefClass | null; if (cls) setPrefClass(cls); } catch { /* noop */ }
  }, []);
  const saveFav = () => { try { localStorage.setItem(FAVORITE_ASSET_KEY, (fav || "").toUpperCase()); } catch { /* noop */ } };

  // Bloquear scroll del fondo cuando el modal está abierto (solución móvil-friendly)
  useEffect(() => {
    if (!showFavPicker) return;
    
    // Prevenir scroll en iOS y Android
    const preventDefault = (e: TouchEvent) => {
      if ((e.target as HTMLElement)?.closest('[data-tour="favorite-modal"]')) return;
      e.preventDefault();
    };
    
    document.body.style.overflow = 'hidden';
    document.addEventListener('touchmove', preventDefault, { passive: false });
    
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('touchmove', preventDefault);
    };
  }, [showFavPicker]);

  function emit(name: string, detail?: unknown) {
    const scope = document.querySelector('[data-tour="profile-favorite"]') || document;
    scope.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
  }
  const savePrefClass = () => { try { localStorage.setItem(PREF_CLASS_KEY, prefClass); } catch { /* noop */ } };

  // Recupera y persiste preferencias
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const next = { ...defaultPrefs };
      (Object.keys(defaultPrefs) as PrefKey[]).forEach((key) => {
        if (typeof parsed[key] === "boolean") next[key] = parsed[key] as boolean;
      });
      setPrefs(next);
    } catch {
      // ignora errores de parseo
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(PROFILE_PREFS_KEY, JSON.stringify(prefs)); } catch { /* noop */ }
  }, [prefs]);

  // Recupera y persiste checklist
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_CHECKLIST_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const next = { ...defaultChecklistState };
      checklistItems.forEach((item) => {
        if (typeof parsed[item.id] === "boolean") next[item.id] = parsed[item.id] as boolean;
      });
      setChecklist(next);
    } catch {
      // ignora errores de parseo
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(PROFILE_CHECKLIST_KEY, JSON.stringify(checklist)); } catch { /* noop */ }
  }, [checklist]);

  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(() => {
    return oldPwd.length >= 1 && newPwd.length >= 8; // Cognito validara politicas reales
  }, [oldPwd, newPwd]);

  const completionData = useMemo(() => {
    const totalChecklist = checklistItems.length || 1;
    const doneChecklist = checklistItems.reduce((acc, item) => acc + (checklist[item.id] ? 1 : 0), 0);
    const prefTotal = (Object.keys(defaultPrefs) as PrefKey[]).length || 1;
    const prefActive = (Object.keys(defaultPrefs) as PrefKey[]).reduce(
      (acc, key) => acc + (prefs[key] ? 1 : 0),
      0,
    );
    const checklistPercent = Math.round((doneChecklist / totalChecklist) * 100);
    const prefPercent = Math.round((prefActive / prefTotal) * 100);
    const profileHealth = Math.round(checklistPercent * 0.6 + prefPercent * 0.4);

    let copy = "Estas comenzando. Prioriza completar el checklist principal y activar al menos una alerta.";
    if (profileHealth >= 75) {
      copy = "Tu perfil esta casi completo. Repasa estos pasos cada trimestre para mantener todo al dia.";
    } else if (profileHealth >= 40) {
      copy = "Buen avance. Falta muy poco para sacar el maximo provecho de Aura.";
    }

    const nextStep = checklistItems.find((item) => !checklist[item.id]) ?? null;

    return {
      checklistPercent,
      prefPercent,
      profileHealth,
      copy,
      doneCount: doneChecklist,
      totalCount: totalChecklist,
      nextStep,
      prefActive,
      prefTotal,
    };
  }, [checklist, prefs]);

  const healthWidthClass = useMemo(() => {
    const v = Math.round(Math.min(100, Math.max(0, completionData.profileHealth)) / 5) * 5;
    return `w-p-${v}`;
  }, [completionData.profileHealth]);
  const checklistWidthClass = useMemo(() => {
    const v = Math.round(Math.min(100, Math.max(0, completionData.checklistPercent)) / 5) * 5;
    return `w-p-${v}`;
  }, [completionData.checklistPercent]);

  const firstName = useMemo(() => {
    if (!sess?.email) return "inversor";
    const base = sess.email.split("@")[0];
    return base.length ? base[0].toUpperCase() + base.slice(1) : "inversor";
  }, [sess]);

  const tokenExpires = secsToHuman(sess?.expiresAt);

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      notify("La nueva contrasena debe tener al menos 8 caracteres.");
      return;
    }
    try {
      setBusy(true);
      const { updatePassword } = await import("aws-amplify/auth");
      await updatePassword({ oldPassword: oldPwd, newPassword: newPwd });
      setOldPwd("");
      setNewPwd("");
      notify("Contrasena actualizada.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo actualizar la contrasena.";
      notify(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    try {
      await logout();
    } finally {
      router.replace("/"); // vuelve al login
    }
  }

  function togglePref(key: PrefKey) {
    setPrefs((prev) => {
      const nextValue = !prev[key];
      const next = { ...prev, [key]: nextValue };
      notify(nextValue ? prefCopy[key].onMsg : prefCopy[key].offMsg);
      return next;
    });
  }

  function toggleChecklist(id: (typeof checklistItems)[number]["id"]) {
    setChecklist((prev) => {
      const nextValue = !prev[id];
      const next = { ...prev, [id]: nextValue };
      const item = checklistItems.find((x) => x.id === id);
      if (item) {
        notify(nextValue ? `Paso completado: ${item.title}` : `Paso pendiente: ${item.title}`);
      }
      return next;
    });
  }

  const learningCards = useMemo(
    () => [
      {
        title: "Perfil de inversion paso a paso",
        detail: "Ajusta tu perfil de riesgo para recibir recomendaciones hechas a tu medida.",
        action: "Abrir asistente",
        onAction: () => router.push("/risk"),
      },
      {
        title: "Simulador de escenarios",
        detail: "Proba como evolucionaria tu cartera con distintas tasas y horizontes.",
        action: "Abrir simulador",
        onAction: () => router.push("/simulator"),
      },
      {
        title: "Cuenta papel para practicar",
        detail: "Entrena estrategias en un entorno seguro antes de operar con dinero real.",
        action: "Ir a cuenta paper",
        onAction: () => router.push("/paper"),
      },
    ],
    [router],
  );

  const nextStep = completionData.nextStep;
  const nextStepHref = nextStep?.href;
  const nextStepCta = nextStep?.ctaLabel;

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-3 sm:px-6 py-6 sm:py-10">
        <header
          className="panel-hero p-8"
          data-tour="profile-header"
          data-tour-target="profile-overview-section"
        >
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div className="space-y-4">
              <span className="chip uppercase tracking-wide">Perfil personal</span>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold leading-tight">Hola {firstName}, personalicemos tu experiencia</h1>
                <p className="text-sm text-subtle">
                  Administra datos claves, activa recordatorios y sigue una guia simple para mantener tu plan en movimiento.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCoachMode((v) => !v)}
                  className="btn btn-ghost"
                  data-tour-target="profile-coach-toggle"
                >
                  {coachMode ? "Ocultar ayuda paso a paso" : "Necesito ayuda simple"}
                </button>
                <button className="btn" type="button" onClick={onLogout} data-tour-target="profile-logout">
                  Cerrar sesion
                </button>
              </div>
            </div>
            <div className="w-full max-w-sm surface-muted p-6">
              <div className="text-xs uppercase tracking-wide text-faint">Salud del perfil</div>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="text-4xl font-semibold">{completionData.profileHealth}</span>
                <span className="text-sm text-faint">de 100</span>
              </div>
              <div className="mt-2 text-sm text-success">
                Checklist {completionData.checklistPercent}% • Preferencias {completionData.prefPercent}%
              </div>
              <div className="mt-4 progress-track">
                <div className={`progress-fill progress-smooth ${healthWidthClass}`} />
              </div>
              <p className="mt-4 text-sm text-subtle">{completionData.copy}</p>
              {completionData.nextStep && (
                <p className="mt-3 text-xs text-faint">
                  Siguiente paso sugerido:{" "}
                  <span className="font-medium text-strong">{completionData.nextStep.title}</span>
                </p>
              )}
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <article className="surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Datos de la cuenta</h2>
              <span className="chip-success">
                Sesion {sess ? "activa" : "no disponible"}
              </span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-faint">Email</div>
                <div className="text-sm text-strong">{sess?.email ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-faint">User ID</div>
                <div className="text-sm text-strong">{mask(sess?.user_id, 6)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-faint">Expiracion del token</div>
                <div className="text-sm text-strong">{tokenExpires}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-faint">Preferencias activas</div>
                <div className="text-sm text-strong">
                  {completionData.prefActive}/{completionData.prefTotal}
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs text-faint">
              Mantener estos datos actualizados nos ayuda a darte alertas personalizadas y a responder mas rapido ante cualquier consulta.
            </p>
          </article>

          <article className="surface flex flex-col justify-between gap-4 p-6">
            <div>
              <h3 className="text-base font-semibold">Recordatorio rapido</h3>
              <p className="mt-2 text-sm text-subtle">
                {completionData.nextStep
                  ? `Marca como completado: ${completionData.nextStep.detail}`
                  : "Todo al dia por ahora. Agenda revisar tu perfil cada pocas semanas."}
              </p>
            </div>
            {nextStepHref && nextStepCta ? (
              <button
                type="button"
                className="rounded-xl border border-emerald-400/60 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25 day:bg-emerald-500/12 day:text-emerald-600 day:border-emerald-500/30 day:hover:bg-emerald-500/18"
                onClick={() => router.push(nextStepHref)}
              >
                {nextStepCta}
              </button>
            ) : (
              <div className="surface-muted px-4 py-3 text-xs text-faint">
                Consejo: configura un recordatorio en tu calendario para revisar tu plan cada 30 dias.
              </div>
            )}
          </article>
        </section>

        <section className="surface p-6" data-tour="profile-favorite">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Activo favorito</h2>
              <p className="mt-1 text-sm text-subtle">Se destacará en tu página de inicio para acceso rápido.</p>
            </div>
            {fav && (
              <div className="chip-accent">
                <SymbolAvatar symbol={fav} size={18} />
                <span className="text-sm font-medium">{fav}</span>
              </div>
            )}
          </div>
          <div className="mt-4">
            <button
              className="btn btn-primary w-full sm:w-auto"
              data-tour-target="favorite-choose"
              onClick={() => { setShowFavPicker(true); emit("aura:fav-opened"); }}
            >
              {fav ? "Cambiar activo favorito" : "Elegir activo favorito"}
            </button>
          </div>
          {showFavPicker && (
            <SymbolPicker
              open={showFavPicker}
              allowClose={!forcePick}
              onClose={() => setShowFavPicker(false)}
              suggestions={SUGGESTIONS}
              onPick={(s: string) => { setFav(s); saveFav(); setShowFavPicker(false); emit("aura:fav-selected", { symbol: s }); }}
            />
          )}
        </section>

        <section className="surface p-6" data-tour="profile-home-filter">
          <h2 className="text-lg font-semibold">Clase preferida en inicio</h2>
          <p className="mt-1 text-sm text-subtle">Filtra automáticamente el tipo de activos que ves por defecto.</p>
          <div className="mt-4 flex items-center gap-3">
            <select
              aria-label="Seleccionar clase preferida en inicio"
              className="input flex-1 max-w-xs"
              data-tour-target="home-filter-select"
              value={prefClass}
              onChange={(e) => {
                const newVal = e.target.value as typeof prefClass;
                setPrefClass(newVal);
                savePrefClass();
                notify(`Clase preferida actualizada: ${newVal === "all" ? "Todas" : newVal}`);
              }}
            >
              <option value="all">Todas las clases</option>
              <option value="crypto">Criptomonedas</option>
              <option value="forex">Divisas (Forex)</option>
              <option value="equity">Acciones</option>
              <option value="etf">ETFs</option>
              <option value="index">Índices</option>
            </select>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-subtle">
              Se guarda automáticamente
            </div>
          </div>
        </section>

        <section className="surface p-6" data-tour="profile-alerts">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Preferencias y alertas</h2>
              <p className="text-sm text-subtle">
                Activa las opciones que te ayudan a tomar decisiones oportunas sin abrumarte.
              </p>
            </div>
            <span className="text-xs uppercase tracking-wide text-faint">
              {completionData.prefActive}/{completionData.prefTotal} activas
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3" data-tour-target="profile-alerts-grid">
            {(Object.keys(defaultPrefs) as PrefKey[]).map((key, idx) => {
              const checkboxId = `pref-${key}`;
              return (
                <div
                  key={key}
                  data-tour-target={idx === 0 ? "alerts-weekly" : undefined}
                  className={`surface-muted flex items-start gap-3 p-4 transition ${
                    prefs[key]
                      ? "border-emerald-400/60 bg-emerald-400/12 shadow-lg"
                      : "border-transparent"
                  }`}
                >
                  <input
                    id={checkboxId}
                    type="checkbox"
                    aria-describedby={`${checkboxId}-detail`}
                    data-tour-target={idx === 0 ? "alerts-weekly" : undefined}
                    checked={prefs[key]}
                    onChange={() => togglePref(key)}
                    className="mt-1 h-4 w-4 rounded border-white/40 bg-black/60 text-emerald-400 focus:ring-emerald-300"
                  />
                  <div className="space-y-1">
                    <label htmlFor={checkboxId} className="text-sm font-semibold text-strong cursor-pointer">
                      {prefCopy[key].title}
                    </label>
                    <p id={`${checkboxId}-detail`} className="text-xs text-faint">{prefCopy[key].detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="surface p-6" data-tour="profile-checklist">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Checklist de seguridad y habitos</h2>
              <p className="text-sm text-subtle">
                Marca cada paso para reforzar tu disciplina y mantener la cuenta protegida.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs uppercase tracking-wide text-faint">
                {completionData.doneCount}/{completionData.totalCount} completado
              </span>
              <div className="mt-2 progress-track progress-mini">
                <div className={`progress-fill progress-smooth ${checklistWidthClass}`} />
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2" data-tour-target="profile-checklist-grid">
            {checklistItems.map((item, idx) => {
              const checkboxId = `check-${item.id}`;
              const checked = Boolean(checklist[item.id]);
              const href = item.href;
              const ctaLabel = item.ctaLabel;
              return (
                <div
                  key={item.id}
                  data-tour-target={idx === 0 ? "checklist-first" : undefined}
                  className={`surface-muted flex items-start gap-3 p-4 transition ${
                    checked
                      ? "border-emerald-400/60 bg-emerald-400/12 shadow-lg"
                      : "border-transparent"
                  }`}
                >
                  <input
                    id={checkboxId}
                    type="checkbox"
                    data-tour-target={idx === 0 ? "checklist-first-checkbox" : undefined}
                    checked={checked}
                    onChange={() => toggleChecklist(item.id)}
                    className="mt-1 h-4 w-4 rounded border-white/40 bg-black/60 text-emerald-400 focus:ring-emerald-300"
                  />
                  <div className="space-y-1">
                    <label htmlFor={checkboxId} className="text-sm font-semibold text-strong cursor-pointer">
                      {item.title}
                    </label>
                    <p className="text-xs text-faint">{item.detail}</p>
                    {href && ctaLabel && (
                      <button
                        type="button"
                        className="text-xs font-medium text-emerald-200 underline-offset-2 transition hover:underline"
                        onClick={() => router.push(href)}
                      >
                        {ctaLabel}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="surface p-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Actualiza tu contrasena</h2>
            <p className="text-sm text-subtle">
              Cambia tu contrasena de manera segura. Usa una frase facil de recordar pero dificil de adivinar.
            </p>
          </div>
          <form onSubmit={onChangePassword} className="mt-4 grid gap-3 max-w-lg">
            <label className="grid gap-1">
              <span className="text-xs uppercase tracking-wide text-faint">Contraseña actual</span>
              <input
                type="password"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-400/40"
                autoComplete="current-password"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs uppercase tracking-wide text-faint">Nueva contraseña</span>
              <input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-400/40"
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={!canSubmit || busy}>
              {busy ? "Actualizando..." : "Actualizar contraseña"}
            </button>
          </form>
          <p className="mt-3 text-xs text-faint">
            Cognito valida la política real (longitud, combinación de caracteres, etc.).
          </p>
        </section>

        <section className="surface p-6">
          <h2 className="text-lg font-semibold">Aprendizaje y herramientas</h2>
          <p className="mt-2 text-sm text-subtle">Explora modulos que te ayudan a tomar decisiones con confianza.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {learningCards.map((card) => (
              <article
                key={card.title}
                className="surface-muted flex flex-col justify-between p-5 transition hover:border-strong"
              >
                <div>
                  <h3 className="text-base font-semibold text-strong">{card.title}</h3>
                  <p className="mt-2 text-sm text-subtle">{card.detail}</p>
                </div>
                <button
                  type="button"
                  className="mt-4 inline-flex items-center justify-center rounded-xl border border-emerald-400/60 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25 day:bg-emerald-500/12 day:text-emerald-600 day:border-emerald-500/30 day:hover:bg-emerald-500/18"
                  onClick={card.onAction}
                >
                  {card.action}
                </button>
              </article>
            ))}
          </div>
        </section>

        {coachMode && (
          <section className="surface p-6">
            <h2 className="text-lg font-semibold">Ayuda paso a paso para nuevos inversores</h2>
            <p className="mt-2 text-sm text-subtle">
              Sigue estas ideas simples para sentir control del proceso sin abrumarte.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {coachTips.map((tip) => (
                <article
                  key={tip.title}
                  className="surface-muted p-5 transition hover:border-strong"
                >
                  <h3 className="text-base font-semibold text-strong">{tip.title}</h3>
                  <p className="mt-2 text-sm text-subtle">{tip.detail}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}







