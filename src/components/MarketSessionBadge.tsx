"use client";

import React, { useMemo } from "react";
import { getSessionInfo } from "@/lib/market";
import { TechTerm } from "@/components/glossary/Glossary";

export default function MarketSessionBadge({ symbol, className }: { symbol?: string; className?: string }) {
  const info = useMemo(() => (symbol ? getSessionInfo(symbol) : null), [symbol]);
  if (!info) return null;

  const label = info.is24x7
    ? "24/7"
    : info.is24x5
      ? `24/5 · Cierra: ${info.nextCloseLocal ?? '-'}`
      : `Cierra: ${info.nextCloseLocal ?? '-'}`;

  return (
    <div className={`tooltip ${className ?? ''}`}>
      <span className="chip">
        {info.market} · {label}
      </span>
      <div role="tooltip" className="tooltip-panel">
        <div className="tooltip-title">Sesión de mercado</div>
        <div className="tooltip-text">
          {info.note}
          {!info.is24x7 && (
            <div className="mt-1">
              ¿Qué es el <TechTerm term="cierre" />? Es el fin de la <TechTerm term="mercado abierto" /> (sesión regular) para ese activo.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

