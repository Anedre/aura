"use client";

import React from "react";
import { getAssetMeta } from "@/lib/assets.meta";
import { classifySymbol, type AssetClass, getSessionInfo } from "@/lib/market";

function classLabel(c: AssetClass | "other"): string {
  return c === "crypto" ? "Cripto"
    : c === "equity" ? "Acción"
    : c === "etf" ? "ETF"
    : c === "forex" ? "Forex"
    : c === "index" ? "Índice"
    : "Otro";
}

export default function AssetHover({ symbol, children, full = true }: { symbol: string; children: React.ReactNode; full?: boolean }) {
  const meta = getAssetMeta(symbol);
  const cls = classifySymbol(symbol) as AssetClass | "other";
  const session = getSessionInfo(symbol);
  return (
    <span className="tooltip">
      {children}
      <div role="tooltip" className="tooltip-panel">
        <div className="tooltip-title">{meta?.name ?? symbol}</div>
        <div className="tooltip-text">
          <div>{meta?.description ?? `Activo: ${classLabel(cls)}.`}</div>
          {full && (
            <div className="mt-1 opacity-80">
              <div>Clase: {classLabel(cls)}</div>
              {session && (
                <div className="mt-1 text-[11px]">{session.note}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </span>
  );
}
