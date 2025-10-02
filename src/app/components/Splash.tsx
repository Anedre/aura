"use client";

type Props = { label?: string };

export default function Splash({ label = "Cargando AURA…" }: Props) {
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        {/* Logo con favicon */}
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 grid place-items-center shadow-lg">
          {/* <img> sobre .ico es más fiable que next/image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.ico" alt="AURA" className="w-8 h-8 animate-pulse" />
        </div>

        <p className="text-sm opacity-80">{label}</p>

        {/* Barra "shimmer" simple */}
        <div className="h-1 w-40 rounded overflow-hidden bg-white/10">
          <div className="h-full w-1/3 bg-white/40 animate-[shimmer_1.4s_infinite]"></div>
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-130%); }
          50% { transform: translateX(160%); }
          100% { transform: translateX(-130%); }
        }
      `}</style>
    </div>
  );
}
