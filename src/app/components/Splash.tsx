"use client";

type Props = { label?: string };

export default function Splash({ label = "Cargando AURA…" }: Props) {
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-[rgba(3,6,15,0.85)] backdrop-blur-md">
      <div className="relative w-[min(20rem,90vw)] rounded-3xl border border-white/15 bg-[rgba(14,19,40,0.88)] px-8 py-10 text-center shadow-2xl overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[rgba(119,102,255,0.18)] blur-3xl animate-[splashGlow_3.6s_ease-in-out_infinite]" />
        <div className="absolute -bottom-28 left-8 h-48 w-48 rounded-full bg-[rgba(54,224,184,0.2)] blur-3xl animate-[splashGlow_4.2s_ease-in-out_infinite_reverse]" />

        <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-[30%] bg-white/5 ring-1 ring-white/25 shadow-lg shadow-[rgba(0,0,0,0.45)]">
          <div className="absolute inset-0 rounded-[30%] border border-white/20 animate-[splashPulse_1.6s_ease-in-out_infinite]" />
          <div className="absolute inset-[-18px] rounded-full border border-white/10 animate-[spin_6s_linear_infinite]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.ico" alt="AURA" className="relative h-9 w-9 animate-[float_2.6s_ease-in-out_infinite]" />
        </div>

        <p className="relative mt-6 text-sm font-medium tracking-wide text-white/80">{label}</p>
        <p className="relative mt-2 text-xs text-white/60">
          Sintetizando mercado, ajustando señales y preparando tu experiencia.
        </p>

        <div className="relative mt-6 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <span className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-gradient-to-r from-[rgba(119,102,255,0.8)] via-[rgba(54,224,184,0.8)] to-transparent animate-[splashShimmer_1.4s_linear_infinite]" />
        </div>
      </div>

      <style jsx>{`
        @keyframes splashPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.04); opacity: 0.9; }
        }
        @keyframes splashGlow {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.08); }
        }
        @keyframes splashShimmer {
          0% { transform: translateX(-110%); }
          100% { transform: translateX(120%); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}

