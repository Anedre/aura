"use client";

export default function LoadingScreen({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85">
      <div className="animate-pulse text-center">
        <div className="text-2xl font-bold tracking-wider">AURA</div>
        <div className="text-sm opacity-75 mt-1">Inicializando modelo y datos…</div>
      </div>
    </div>
  );
}
