"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MobileBottomSheet from "./MobileBottomSheet";
import SymbolAvatar from "@/components/SymbolAvatar";
import { classifySymbol } from "@/lib/market";
import { getAssetMeta } from "@/lib/assets.meta";

type Props = {
  open: boolean;
  allowClose?: boolean;
  onClose: () => void;
  onPick: (symbol: string) => void;
  suggestions: string[];
  initialQuery?: string;
};

const CLASS_LABELS: Record<string, string> = { 
  crypto: "Cripto", 
  equity: "Acciones", 
  etf: "ETF", 
  forex: "Forex", 
  index: "Índices", 
  other: "Otros" 
};

const CLASS_BADGES: Record<string, { bg: string; text: string }> = {
  crypto: { bg: "bg-amber-500/16", text: "text-amber-300" },
  equity: { bg: "bg-blue-500/16", text: "text-blue-300" },
  etf: { bg: "bg-purple-500/16", text: "text-purple-300" },
  forex: { bg: "bg-emerald-500/16", text: "text-emerald-300" },
  index: { bg: "bg-cyan-500/16", text: "text-cyan-300" },
  other: { bg: "bg-gray-500/16", text: "text-gray-300" },
};

export default function SymbolPicker({ open, allowClose = true, onClose, onPick, suggestions, initialQuery = "" }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [highlight, setHighlight] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(-1);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const list = useMemo(() => {
    const q = query.trim().toUpperCase();
    return suggestions.filter((s) => s.toUpperCase().includes(q)).slice(0, 80);
  }, [query, suggestions]);

  const flat = useMemo(() => {
    const groups: Record<string, string[]> = { crypto: [], equity: [], etf: [], forex: [], index: [], other: [] };
    for (const s of list) {
      const k = classifySymbol(s);
      (groups[k] ?? groups.other).push(s);
    }
    const order: Array<keyof typeof groups> = ["crypto", "equity", "etf", "forex", "index", "other"];
    const out: Array<{ k: string; s: string }> = [];
    order.forEach((k) => groups[k].forEach((s) => out.push({ k, s })));
    return out;
  }, [list]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && allowClose) { onClose(); return; }
    if (e.key === "Enter") {
      const idx = highlight >= 0 && highlight < flat.length ? highlight : 0;
      const pick = flat[idx]?.s ?? query.trim().toUpperCase();
      if (pick) onPick(pick);
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min((h < 0 ? -1 : h) + 1, flat.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max((h < 0 ? flat.length : h) - 1, 0)); return; }
  }

  return (
    <MobileBottomSheet open={open} onClose={onClose} allowClose={allowClose} title={undefined}>
      <div className="aura-picker">
        <div className="aura-picker__hero">
          <div className="aura-picker__brand">AURA</div>
          <div className="aura-picker__subtitle">Encuentra tu símbolo</div>
        </div>
        <div className="aura-picker__search">
          <input
            ref={inputRef}
            autoFocus
            className="aura-picker__input"
            placeholder="BTC-USD, AAPL, EURUSD..."
            enterKeyHint="search"
            inputMode="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlight(-1); }}
            onKeyDown={onKeyDown}
            aria-label="Buscar símbolo"
          />
        </div>
        <div className="aura-picker__list">
          {flat.length === 0 ? (
            <div className="aura-picker__empty">
              <span className="aura-picker__empty-icon">🔍</span>
              <span>Sin resultados</span>
            </div>
          ) : (
            flat.map((row, i) => {
              const s = row.s;
              const m = getAssetMeta(s);
              const showHeader = i === 0 || flat[i - 1].k !== row.k;
              const active = i === highlight;
              const badge = CLASS_BADGES[row.k] ?? CLASS_BADGES.other;
              return (
                <div key={`${row.k}-${s}`}>
                  {showHeader && (
                    <div className="aura-picker__section">
                      <span className={`aura-picker__badge ${badge.bg} ${badge.text}`}>
                        {CLASS_LABELS[row.k] ?? row.k}
                      </span>
                    </div>
                  )}
                  <button
                    className={`aura-picker__item ${active ? "is-active" : ""}`}
                    onMouseEnter={() => setHighlight(i)}
                    onFocus={() => setHighlight(i)}
                    onClick={() => onPick(s)}
                  >
                    <SymbolAvatar symbol={s} size={28} />
                    <div className="aura-picker__item-content">
                      <span className="aura-picker__item-symbol">{s}</span>
                      {m?.name && <span className="aura-picker__item-name">{m.name}</span>}
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="aura-picker__footer">
          <span className="aura-picker__hint">↑↓ Navegar • Enter Seleccionar</span>
        </div>
      </div>
    </MobileBottomSheet>
  );
}
