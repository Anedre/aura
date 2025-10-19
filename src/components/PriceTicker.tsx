"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import MarketSessionBadge from "@/components/MarketSessionBadge";
import SymbolAvatar from "@/components/SymbolAvatar";
import AssetHover from "@/components/AssetHover";
import { useLivePrice } from "@/hooks/useLivePrice";
import { TechTerm } from "@/components/glossary/Glossary";

export type PriceTickerProps = {
  price: number | null | undefined;
  deltaPct?: number | null;
  className?: string;
  decimals?: number; // si no se pasa: 2 para >=100, si no 3
  percentDecimals?: number; // default 2
  updateEveryMs?: number; // refresco del rótulo de hora
  symbol?: string; // símbolo a mostrar (ej. BTC-USD)
  symbolMode?: 'avatar' | 'plain' | 'none'; // cómo renderizar el símbolo junto al precio
  hover?: boolean; // si envolver el símbolo con tooltip (AssetHover)
};

export default function PriceTicker({
  price,
  deltaPct,
  className,
  decimals,
  percentDecimals = 2,
  updateEveryMs = 5_000,
  symbol,
  symbolMode = 'avatar',
  hover = true,
}: PriceTickerProps) {
  const [now, setNow] = useState<Date>(new Date());
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevRef = useRef<number | null>(null);

  // Precio en vivo independiente (WS) si hay símbolo
  const live = useLivePrice(symbol ?? "");

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), updateEveryMs);
    return () => clearInterval(id);
  }, [updateEveryMs]);

  const displayPrice = live?.price ?? price ?? null;

  const { diffAbs } = useMemo(() => {
    if (displayPrice == null || !Number.isFinite(displayPrice) || deltaPct == null || !Number.isFinite(deltaPct)) {
      return { base: null as number | null, diffAbs: null as number | null };
    }
    const b = displayPrice / (1 + (deltaPct / 100));
    return { base: b, diffAbs: displayPrice - b };
  }, [displayPrice, deltaPct]);

  const up = (diffAbs ?? 0) >= 0;
  const color = up ? "text-emerald-300" : "text-rose-300";

  // Efecto visual cuando cambia el precio
  useEffect(() => {
    const prev = prevRef.current;
    if (displayPrice != null && Number.isFinite(displayPrice) && prev != null && Number.isFinite(prev) && displayPrice !== prev) {
      setFlash(displayPrice > prev ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 550);
      prevRef.current = displayPrice;
      return () => clearTimeout(t);
    }
    if (displayPrice != null && Number.isFinite(displayPrice)) prevRef.current = displayPrice;
  }, [displayPrice]);

  const pDecimals = useMemo(() => {
    if (typeof decimals === "number") return decimals;
    if (displayPrice == null || !Number.isFinite(displayPrice)) return 2;
    return displayPrice >= 100 ? 2 : 3;
  }, [decimals, displayPrice]);

  const nfDyn = (n: number, d: number) => n.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <div className={`${className ?? ""} ${flash === "up" ? "price-flash-up" : flash === "down" ? "price-flash-down" : ""}`}>
      <div className="flex items-baseline gap-3 flex-wrap">
        {symbol && symbolMode !== 'none' && (
          symbolMode === 'plain' ? (
            hover ? (
              <AssetHover symbol={symbol}><span className="chip select-none">{symbol}</span></AssetHover>
            ) : (
              <span className="chip select-none">{symbol}</span>
            )
          ) : (
            hover ? (
              <AssetHover symbol={symbol}>
                <span className="chip select-none flex items-center gap-1">
                  <SymbolAvatar symbol={symbol} size={18} />
                  <span>{symbol}</span>
                </span>
              </AssetHover>
            ) : (
              <span className="chip select-none flex items-center gap-1">
                <SymbolAvatar symbol={symbol} size={18} />
                <span>{symbol}</span>
              </span>
            )
          )
        )}
        <div className="font-extrabold tracking-tight text-3xl md:text-4xl">
          {displayPrice != null && Number.isFinite(displayPrice) ? nfDyn(displayPrice, pDecimals) : "-"}
        </div>
        <div className={`font-semibold ${color}`}>
          {diffAbs != null && Number.isFinite(diffAbs) ? (
            <>
              {up ? "▲" : "▼"} {nfDyn(Math.abs(diffAbs), pDecimals)} ({nfDyn(Math.abs(deltaPct ?? 0), percentDecimals)} %)
            </>
          ) : (
            <span className="opacity-60">sin cambios</span>
          )}
        </div>
        {symbol && <MarketSessionBadge symbol={symbol} />}
      </div>
      <div className="text-[11px] opacity-80 mt-1">
        A partir de las {now.toUTCString().slice(17, 25)} UTC. Explicamos <TechTerm term="cierre" /> y <TechTerm term="mercado abierto" /> al pasar el mouse.
      </div>
    </div>
  );
}
