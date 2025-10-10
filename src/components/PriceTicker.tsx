"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type PriceTickerProps = {
  price: number | null | undefined;
  deltaPct?: number | null;
  className?: string;
  decimals?: number; // si no se pasa: 2 para >=100, si no 3
  percentDecimals?: number; // default 2
  updateEveryMs?: number; // refresco del rótulo de hora
  symbol?: string; // símbolo a mostrar (ej. BTC-USD)
};

export default function PriceTicker({
  price,
  deltaPct,
  className,
  decimals,
  percentDecimals = 2,
  updateEveryMs = 5_000,
  symbol,
}: PriceTickerProps) {
  const [now, setNow] = useState<Date>(new Date());
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), updateEveryMs);
    return () => clearInterval(id);
  }, [updateEveryMs]);

  const { diffAbs } = useMemo(() => {
    if (price == null || !Number.isFinite(price) || deltaPct == null || !Number.isFinite(deltaPct)) {
      return { base: null as number | null, diffAbs: null as number | null };
    }
    const b = price / (1 + (deltaPct / 100));
    return { base: b, diffAbs: price - b };
  }, [price, deltaPct]);

  const up = (diffAbs ?? 0) >= 0;
  const color = up ? "text-emerald-300" : "text-rose-300";

  // Efecto visual cuando cambia el precio
  useEffect(() => {
    const prev = prevRef.current;
    if (price != null && Number.isFinite(price) && prev != null && Number.isFinite(prev) && price !== prev) {
      setFlash(price > prev ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 550);
      prevRef.current = price;
      return () => clearTimeout(t);
    }
    if (price != null && Number.isFinite(price)) prevRef.current = price;
  }, [price]);

  const pDecimals = useMemo(() => {
    if (typeof decimals === "number") return decimals;
    if (price == null || !Number.isFinite(price)) return 2;
    return price >= 100 ? 2 : 3;
  }, [decimals, price]);

  const nfDyn = (n: number, d: number) => n.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <div className={`${className ?? ""} ${flash === "up" ? "price-flash-up" : flash === "down" ? "price-flash-down" : ""}`}>
      <div className="flex items-baseline gap-3">
        {symbol && <span className="chip select-none">{symbol}</span>}
        <div className="font-extrabold tracking-tight text-3xl md:text-4xl">
          {price != null && Number.isFinite(price) ? nfDyn(price, pDecimals) : "-"}
        </div>
        <div className={`font-semibold ${color}`}>
          {diffAbs != null && Number.isFinite(diffAbs) ? (
            <>
              {up ? "↑" : "↓"} {nfDyn(Math.abs(diffAbs), pDecimals)} ({nfDyn(Math.abs(deltaPct ?? 0), percentDecimals)} %)
            </>
          ) : (
            <span className="opacity-60">sin cambios</span>
          )}
        </div>
      </div>
      <div className="text-[11px] opacity-80 mt-1">
        A partir de las {now.toUTCString().slice(17, 25)} UTC. Mercado abierto.
      </div>
    </div>
  );
}


