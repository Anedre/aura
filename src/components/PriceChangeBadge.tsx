"use client";

import React, { useEffect, useRef, useState } from "react";

export type PriceChangeBadgeProps = {
  value: number | null | undefined;
  className?: string;
  size?: "sm" | "md";
  showArrow?: boolean;
};

export default function PriceChangeBadge({ value, className, size = "sm", showArrow = true }: PriceChangeBadgeProps) {
  const prevRef = useRef<number | null>(null);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  const [blink, setBlink] = useState<boolean>(false);

  useEffect(() => {
    const prev = prevRef.current;
    if (value != null && Number.isFinite(value)) {
      if (prev != null && Number.isFinite(prev) && value !== prev) {
        setDir(value > prev ? "up" : "down");
        setBlink(true);
        const t = window.setTimeout(() => setBlink(false), 800);
        prevRef.current = value;
        return () => window.clearTimeout(t);
      }
      prevRef.current = value;
    }
    return;
  }, [value]);

  const base = "inline-flex items-center justify-center select-none rounded-full border text-[10px] font-bold opacity-90";
  const dim = size === "md" ? "w-6 h-6" : "w-5 h-5";
  const pad = showArrow ? "px-0" : "px-0";
  const tone = dir === "up" ? "price-badge-up" : dir === "down" ? "price-badge-down" : "price-badge-neutral";
  const pulse = blink && dir ? (dir === "up" ? "price-badge-blink-up" : "price-badge-blink-down") : "";

  return (
    <span className={`${base} ${dim} ${pad} ${tone} ${pulse} ${className ?? ""}`} aria-live="polite" aria-label={dir === "up" ? "Sube" : dir === "down" ? "Baja" : "Sin cambio"}>
      {showArrow && (dir === "up" ? "▲" : dir === "down" ? "▼" : "•")}
    </span>
  );
}

