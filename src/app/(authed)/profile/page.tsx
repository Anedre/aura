"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, logout } from "@/lib/auth";
import SymbolAvatar from "@/components/SymbolAvatar";
import { getAssetMeta } from "@/lib/assets.meta";
import { notify } from "@/lib/notify";

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
  learningTips: false,
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
    id: "confirmEmail",
    title: "Confirmar correo principal",
    detail: "Verifica que nuestros correos llegan a tu bandeja y no a spam.",
  },
  {
    id: "updateRisk",
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
  const [sess, setSess] = useState<Sess | null>(null);
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>(defaultPrefs);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => ({ ...defaultChecklistState }));
  const [coachMode, setCoachMode] = useState(false);
  const [fav, setFav] = useState<string>("");
  const [prefClass, setPrefClass] = useState<"all"|"crypto"|"forex"|"equity"|"etf"|"index">('all');
  const [showFavPicker, setShowFavPicker] = useState(false);
  const [favQuery, setFavQuery] = useState("");
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
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-10">
        <header className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/60 via-slate-900/30 to-background p-8 shadow-xl">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div className="space-y-4">
              <span className="inline-flex items-center rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-wide text-white/70">
                Perfil personal
              </span>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold leading-tight">Hola {firstName}, personalicemos tu experiencia</h1>
                <p className="text-sm text-white/70">
                  Administra datos claves, activa recordatorios y sigue una guia simple para mantener tu plan en movimiento.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCoachMode((v) => !v)}
                  className="rounded-xl border border-white/20 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10"
                >
                  {coachMode ? "Ocultar ayuda paso a paso" : "Necesito ayuda simple"}
                </button>
                <button className="btn" type="button" onClick={onLogout}>
                  Cerrar sesion
                </button>
              </div>
            </div>
            <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-black/30 p-6 backdrop-blur">
              <div className="text-xs uppercase tracking-wide text-white/60">Salud del perfil</div>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="text-4xl font-semibold">{completionData.profileHealth}</span>
                <span className="text-sm text-white/60">de 100</span>
              </div>
              <div className="mt-2 text-sm text-emerald-200">
                Checklist {completionData.checklistPercent}% • Preferencias {completionData.prefPercent}%
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, completionData.profileHealth))}%` }}
                />
              </div>
              <p className="mt-4 text-sm text-white/70">{completionData.copy}</p>
              {completionData.nextStep && (
                <p className="mt-3 text-xs text-white/60">
                  Siguiente paso sugerido:{" "}
                  <span className="font-medium text-white/80">{completionData.nextStep.title}</span>
                </p>
              )}
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Datos de la cuenta</h2>
              <span className="rounded-full border border-emerald-400/50 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                Sesion {sess ? "activa" : "no disponible"}
              </span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">Email</div>
                <div className="text-sm text-white/80">{sess?.email ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">User ID</div>
                <div className="text-sm text-white/80">{mask(sess?.user_id, 6)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">Expiracion del token</div>
                <div className="text-sm text-white/80">{tokenExpires}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">Preferencias activas</div>
                <div className="text-sm text-white/80">
                  {completionData.prefActive}/{completionData.prefTotal}
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs text-white/60">
              Mantener estos datos actualizados nos ayuda a darte alertas personalizadas y a responder mas rapido ante cualquier consulta.
            </p>
          </article>

          <article className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-lg">
            <div>
              <h3 className="text-base font-semibold">Recordatorio rapido</h3>
              <p className="mt-2 text-sm text-white/70">
                {completionData.nextStep
                  ? `Marca como completado: ${completionData.nextStep.detail}`
                  : "Todo al dia por ahora. Agenda revisar tu perfil cada pocas semanas."}
              </p>
            </div>
            {nextStepHref && nextStepCta ? (
              <button
                type="button"
                className="rounded-xl border border-emerald-400/60 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/20"
                onClick={() => router.push(nextStepHref)}
              >
                {nextStepCta}
              </button>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-xs text-white/60">
                Consejo: configura un recordatorio en tu calendario para revisar tu plan cada 30 dias.
              </div>
            )}
          </article>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-lg">
          <h2 className="text-lg font-semibold">Activo favorito</h2>
          <p className="mt-1 text-sm text-white/70">Elige un símbolo (ej. BTC-USD, AAPL, EURUSD=X). Se destacará en tu inicio.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input className="input w-48" placeholder="Símbolo" value={fav} onChange={(e) => setFav(e.target.value.toUpperCase())} />
            <button className="btn" onClick={() => setShowFavPicker(true)}>Elegir</button>
            <button className="btn btn-primary" onClick={saveFav}>Guardar favorito</button>
            {fav && <span className="chip">Actual: {fav}</span>}
          </div>
          {showFavPicker && (
            <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
              <div className="absolute inset-0 bg-black/60" onClick={() => setShowFavPicker(false)} />
              <div className="absolute inset-0 flex items-start sm:items-center justify-center p-4 sm:p-6">
                <div className="card w-full max-w-xl p-4">
                  <div className="text-sm opacity-75 mb-2">Buscar símbolo</div>
                  <input
                    autoFocus
                    className="input w-full"
                    placeholder="Escribe un símbolo (ej. BTC-USD, AAPL, EURUSD=X)"
                    value={favQuery}
                    onChange={(e) => setFavQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const q = favQuery.trim().toUpperCase();
                        const matches = SUGGESTIONS.filter(s => s.includes(q));
                        const pick = (matches[0] ?? q);
                        setFav(pick); saveFav(); setShowFavPicker(false);
                      } else if (e.key === 'Escape') { setShowFavPicker(false); }
                    }}
                  />
                  <div className="mt-2 max-h-72 overflow-auto">
                    {(SUGGESTIONS.filter(s => s.toLowerCase().includes(favQuery.toLowerCase())).slice(0, 25)).map((s) => {
                      const m = getAssetMeta(s);
                      return (
                        <button
                          key={s}
                          className={`w-full text-left px-3 py-2 rounded hover:bg-white/10 ${s===fav? 'bg-white/5':''}`}
                          onClick={() => { setFav(s); saveFav(); setShowFavPicker(false); }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <SymbolAvatar symbol={s} size={18} />
                            <span className="font-medium">{s}</span>
                            {m?.name && <span className="opacity-70 text-xs">{m.name}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between mt-3 text-xs opacity-60">
                    <span>Enter: seleccionar</span>
                    <span>Esc: cerrar</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-lg">
          <h2 className="text-lg font-semibold">Clase preferida en inicio</h2>
          <p className="mt-1 text-sm text-white/70">Usamos esta preferencia como filtro por defecto en tu página de inicio. Puedes quitarlo desde la misma pantalla.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select className="input w-56" value={prefClass} onChange={(e) => setPrefClass(e.target.value as typeof prefClass)}>
              <option value="all">Todas</option>
              <option value="crypto">Cripto</option>
              <option value="forex">Forex</option>
              <option value="equity">Acciones</option>
              <option value="etf">ETF</option>
              <option value="index">Índices</option>
            </select>
            <button className="btn btn-primary" onClick={savePrefClass}>Guardar preferencia</button>
            <span className="chip">Actual: {prefClass}</span>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Preferencias y alertas</h2>
              <p className="text-sm text-white/70">
                Activa las opciones que te ayudan a tomar decisiones oportunas sin abrumarte.
              </p>
            </div>
            <span className="text-xs uppercase tracking-wide text-white/60">
              {completionData.prefActive}/{completionData.prefTotal} activas
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {(Object.keys(defaultPrefs) as PrefKey[]).map((key) => (
              <div
                key={key}
                className={`flex items-start gap-3 rounded-xl border p-4 transition ${
                  prefs[key]
                    ? "border-emerald-400/60 bg-emerald-400/10 shadow-lg"
                    : "border-white/10 bg-black/25 hover:border-white/20"
                }`}
              >
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={() => togglePref(key)}
                  className="mt-1 h-4 w-4 rounded border-white/40 bg-black/60 text-emerald-400 focus:ring-emerald-300"
                />
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-white/80">{prefCopy[key].title}</div>
                  <p className="text-xs text-white/60">{prefCopy[key].detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Checklist de seguridad y habitos</h2>
              <p className="text-sm text-white/70">
                Marca cada paso para reforzar tu disciplina y mantener la cuenta protegida.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs uppercase tracking-wide text-white/60">
                {completionData.doneCount}/{completionData.totalCount} completado
              </span>
              <div className="mt-2 h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, completionData.checklistPercent))}%` }}
                />
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {checklistItems.map((item) => {
              const checkboxId = `check-${item.id}`;
              const checked = Boolean(checklist[item.id]);
              const href = item.href;
              const ctaLabel = item.ctaLabel;
              return (
                <div
                  key={item.id}
                  className={`flex items-start gap-3 rounded-xl border p-4 transition ${
                    checked
                      ? "border-emerald-400/60 bg-emerald-400/10 shadow-lg"
                      : "border-white/10 bg-black/25 hover:border-white/20"
                  }`}
                >
                  <input
                    id={checkboxId}
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleChecklist(item.id)}
                    className="mt-1 h-4 w-4 rounded border-white/40 bg-black/60 text-emerald-400 focus:ring-emerald-300"
                  />
                  <div className="space-y-1">
                    <label htmlFor={checkboxId} className="text-sm font-semibold text-white/80 cursor-pointer">
                      {item.title}
                    </label>
                    <p className="text-xs text-white/60">{item.detail}</p>
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

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-lg">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Actualiza tu contrasena</h2>
            <p className="text-sm text-white/70">
              Cambia tu contrasena de manera segura. Usa una frase facil de recordar pero dificil de adivinar.
            </p>
          </div>
          <form onSubmit={onChangePassword} className="mt-4 grid gap-3 max-w-lg">
            <label className="grid gap-1">
              <span className="text-xs uppercase tracking-wide text-white/60">Contrasena actual</span>
              <input
                type="password"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-400/40"
                autoComplete="current-password"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs uppercase tracking-wide text-white/60">Nueva contrasena</span>
              <input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-400/40"
                autoComplete="new-password"
                placeholder="Minimo 8 caracteres"
              />
            </label>
            <div className="flex gap-2 pt-2">
              <button className="btn" type="submit" disabled={!canSubmit || busy}>
                {busy ? "Actualizando..." : "Guardar"}
              </button>
              <button
                type="button"
                className="rounded-xl border border-white/20 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10"
                onClick={() => { setOldPwd(""); setNewPwd(""); }}
                disabled={busy}
              >
                Limpiar
              </button>
            </div>
          </form>
          <p className="mt-3 text-xs text-white/60">
            Cognito valida la politica real (longitud, combinacion de caracteres, etc.).
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-lg">
          <h2 className="text-lg font-semibold">Aprendizaje y herramientas</h2>
          <p className="mt-2 text-sm text-white/70">Explora modulos que te ayudan a tomar decisiones con confianza.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {learningCards.map((card) => (
              <article
                key={card.title}
                className="flex flex-col justify-between rounded-xl border border-white/10 bg-black/25 p-5 transition hover:border-white/20"
              >
                <div>
                  <h3 className="text-base font-semibold text-white/80">{card.title}</h3>
                  <p className="mt-2 text-sm text-white/70">{card.detail}</p>
                </div>
                <button
                  type="button"
                  className="mt-4 inline-flex items-center justify-center rounded-xl border border-emerald-400/60 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/20"
                  onClick={card.onAction}
                >
                  {card.action}
                </button>
              </article>
            ))}
          </div>
        </section>

        {coachMode && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Ayuda paso a paso para nuevos inversores</h2>
            <p className="mt-2 text-sm text-white/70">
              Sigue estas ideas simples para sentir control del proceso sin abrumarte.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {coachTips.map((tip) => (
                <article
                  key={tip.title}
                  className="rounded-xl border border-white/10 bg-black/25 p-5 transition hover:border-white/20"
                >
                  <h3 className="text-base font-semibold text-white/80">{tip.title}</h3>
                  <p className="mt-2 text-sm text-white/70">{tip.detail}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
