// src/components/EquityChart.tsx
"use client";

type Pt = { t: string | number; y: number };

export default function EquityChart({ data, height = 220 }: { data: Pt[]; height?: number }) {
  const pad = 28;
  const width = 980;

  const ys = data.map(d => d.y);
  const minY = ys.length ? Math.min(...ys, 0) : 0;
  const maxY = ys.length ? Math.max(...ys, 0) : 1;
  const span = Math.max(1e-6, maxY - minY);

  const x = (i: number) => pad + i * ((width - 2 * pad) / Math.max(1, data.length - 1));
  const y = (v: number) => height - pad - ((v - minY) / span) * (height - 2 * pad);

  const path = data.length
    ? data.map((d, i) => `${i ? "L" : "M"} ${x(i).toFixed(2)} ${y(d.y).toFixed(2)}`).join(" ")
    : "";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto rounded-xl border border-white/10 bg-white/[0.02]">
      {[minY, minY + span / 2, maxY].map((ty, i) => (
        <g key={i}>
          <line x1={pad} y1={y(ty)} x2={width - pad} y2={y(ty)} stroke="currentColor" opacity="0.08" />
          <text x={pad - 6} y={y(ty)} textAnchor="end" dominantBaseline="middle" className="fill-white/60 text-[10px]">
            {Number(ty).toFixed(2)}
          </text>
        </g>
      ))}
      <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="currentColor" opacity="0.12" />
      {path && <path d={`${path}`} className="stroke-emerald-400" strokeWidth="1.8" fill="none" />}
      {path && <path d={`${path} L ${width - pad} ${height - pad} L ${pad} ${height - pad} Z`} className="fill-emerald-400/10" />}
    </svg>
  );
}
