"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import { classifySymbol } from "@/lib/market";
import { getAssetMeta } from "@/lib/assets.meta";

export type SymbolAvatarProps = {
  symbol: string;
  size?: number; // px
  className?: string;
  rounded?: boolean;
  title?: string;
};

function baseFromSymbol(sym: string): string {
  const s = sym.toUpperCase().trim();
  // BTC-USD, BTC/USD → BTC; BTCUSDT → BTC; ETHUSDT → ETH
  if (s.includes("-")) return s.split("-")[0];
  if (s.includes("/")) return s.split("/")[0];
  if (s.endsWith("USDT")) return s.slice(0, -4);
  if (s.endsWith("USD")) return s.slice(0, -3);
  return s;
}

export default function SymbolAvatar({ symbol, size = 18, className, rounded = true, title }: SymbolAvatarProps) {
  const klass = classifySymbol(symbol);
  const base = baseFromSymbol(symbol).toLowerCase();
  const px = Math.max(12, Math.min(128, size));

  const sources = useMemo(() => {
    if (klass === "crypto") {
      const coin = base;
      return [
        // 100% local: token svg si existe
        `/tokens/${coin}.svg`,
        // Fallback genérico local
        `/icons/crypto.svg`,
      ];
    }
    // clases generales
    if (klass === "equity") {
      const m = getAssetMeta(symbol);
      return [m?.logo ?? "/icons/stock.svg"];
    }
    if (klass === "forex") return ["/icons/forex.svg"];
    if (klass === "etf") {
      const m = getAssetMeta(symbol);
      return [m?.logo ?? "/icons/etf.svg"];
    }
    if (klass === "index") return ["/icons/index.svg"];
    return ["/icons/other.svg"];
  }, [klass, base, symbol]);

  const [idx, setIdx] = useState(0);
  const src = sources[idx] ?? "/icons/other.svg";
  const alt = title ?? symbol;

  const style: React.CSSProperties = useMemo(() => ({
    width: px, height: px, borderRadius: rounded ? Math.ceil(px / 2) : 6,
    objectFit: "cover", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
  }), [px, rounded]);

  return (
    <Image
      src={src}
      alt={alt}
      width={px}
      height={px}
      style={style}
      className={`symbol-avatar ${className ?? ''}`}
      onError={() => setIdx((i) => Math.min(sources.length, i + 1))}
      title={alt}
    />
  );
}
