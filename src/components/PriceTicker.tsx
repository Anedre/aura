"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import MarketSessionBadge from "@/components/MarketSessionBadge";
import SymbolAvatar from "@/components/SymbolAvatar";
import AssetHover from "@/components/AssetHover";
import { useLivePrice } from "@/hooks/useLivePrice";
import { useRealtimePrice } from "@/hooks/useRealtimePrice";
import { TechTerm } from "@/components/glossary/Glossary";
import PriceChangeBadge from "@/components/PriceChangeBadge";

const REALTIME_MAX_SKEW_MS = 15_000;

export type PriceTickerProps = {
  price: number | null | undefined;
  deltaPct?: number | null;
  className?: string;
  decimals?: number;
  percentDecimals?: number;
  updateEveryMs?: number;
  symbol?: string;
  symbolMode?: "avatar" | "plain" | "none";
  hover?: boolean;
};

export default function PriceTicker({
  price,
  deltaPct,
  className,
  decimals,
  percentDecimals = 2,
  updateEveryMs = 5_000,
  symbol,
  symbolMode = "avatar",
  hover = true,
}: PriceTickerProps) {
  const [now, setNow] = useState<Date>(new Date());
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevRef = useRef<number | null>(null);

  const live = useLivePrice(symbol ?? "");
  const realtime = useRealtimePrice(symbol ?? "");

  const realtimeFresh = useMemo(() => {
    if (!symbol) return false;
    if (realtime.price == null) return false;
    if (realtime.stale) return false;
    if (realtime.ts == null) return true;
    return Date.now() - realtime.ts < REALTIME_MAX_SKEW_MS;
  }, [symbol, realtime.price, realtime.stale, realtime.ts]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), updateEveryMs);
    return () => clearInterval(id);
  }, [updateEveryMs]);

  const fallbackPrice = useMemo(() => {
    if (live?.price != null && Number.isFinite(live.price)) return live.price;
    if (price != null && Number.isFinite(price)) return price;
    return null;
  }, [live?.price, price]);

  const displayPrice = useMemo(() => {
    if (realtimeFresh && realtime.price != null && Number.isFinite(realtime.price)) return realtime.price;
    if (realtime.price != null && !realtime.stale && Number.isFinite(realtime.price)) return realtime.price;
    return fallbackPrice;
  }, [realtimeFresh, realtime.price, realtime.stale, fallbackPrice]);

  const { diffAbs } = useMemo(() => {
    if (displayPrice == null || !Number.isFinite(displayPrice) || deltaPct == null || !Number.isFinite(deltaPct)) {
      return { base: null as number | null, diffAbs: null as number | null };
    }
    const base = displayPrice / (1 + (deltaPct / 100));
    return { base, diffAbs: displayPrice - base };
  }, [displayPrice, deltaPct]);

  const up = (diffAbs ?? 0) >= 0;
  const color = up ? "text-emerald-300" : "text-rose-300";

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

  const nf = (value: number, d: number) =>
    value.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <div className={`${className ?? ""} ${flash === "up" ? "price-flash-up" : flash === "down" ? "price-flash-down" : ""}`}>
      <div className="flex items-baseline gap-3 flex-wrap">
        {symbol && symbolMode !== "none" && (
          symbolMode === "plain" ? (
            hover ? (
              <AssetHover symbol={symbol}>
                <span className="chip select-none">{symbol}</span>
              </AssetHover>
            ) : (
              <span className="chip select-none">{symbol}</span>
            )
          ) : hover ? (
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
        )}
        <div className="flex items-center gap-2">
          <div className="font-extrabold tracking-tight text-3xl md:text-4xl">
            {displayPrice != null && Number.isFinite(displayPrice) ? nf(displayPrice, pDecimals) : "-"}
          </div>
          <PriceChangeBadge value={displayPrice} />
          <span className="tooltip">
            <span className="info-badge" tabIndex={0} aria-label="¿Qué significa este precio?">?</span>
            <div role="tooltip" className="tooltip-panel">
              <div className="tooltip-title">Precio en vivo</div>
              <div className="tooltip-text">
                Mostramos el último tick recibido por streaming. Si todavía no hay datos nuevos, verás el cierre más reciente del historial.
                Toca el ícono cuando quieras recordar qué dato estás observando.
              </div>
            </div>
          </span>
        </div>
        <div className={`flex items-center gap-2 font-semibold ${color}`}>
          {diffAbs != null && Number.isFinite(diffAbs) ? (
            <>
              {up ? "↑" : "↓"} {nf(Math.abs(diffAbs), pDecimals)} ({nf(Math.abs(deltaPct ?? 0), percentDecimals)} %)
            </>
          ) : (
            <span className="opacity-60">sin cambios</span>
          )}
          <span className="tooltip">
            <span className="info-badge" tabIndex={0} aria-label="¿Por qué cambia este número?">?</span>
            <div role="tooltip" className="tooltip-panel">
              <div className="tooltip-title">Variación del rango</div>
              <div className="tooltip-text">
                Este dato compara el precio actual con el primer punto del rango visible (1D, 1W, 1M, etc.).
                Si cambias el rango o te mueves con el zoom, el punto de referencia cambia y el porcentaje puede variar aunque el precio en vivo sea el mismo.
              </div>
            </div>
          </span>
        </div>
        {symbol && <MarketSessionBadge symbol={symbol} />}
      </div>
      <div className="text-[11px] opacity-80 mt-1">
        A partir de las {now.toUTCString().slice(17, 25)} UTC. Explicamos <TechTerm term="cierre" /> y <TechTerm term="mercado abierto" /> al pasar el mouse.
      </div>
    </div>
  );
}

