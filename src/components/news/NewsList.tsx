// src/components/news/NewsList.tsx
"use client";

import type { NewsItem } from "@/lib/api.news";
import { useMemo } from "react";

function formatRelative(date: string | undefined): string | null {
  if (!date) return null;
  const ts = Date.parse(date);
  if (Number.isNaN(ts)) return null;
  const delta = Date.now() - ts;
  if (delta < 0) return "recién publicada";
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "hace instantes";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `hace ${weeks} sem`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes`;
  const years = Math.floor(days / 365);
  return `hace ${years} año${years > 1 ? "s" : ""}`;
}

export interface NewsListProps {
  title: string;
  items: NewsItem[] | null;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  highlightSymbols?: string[];
  dense?: boolean;
}

export default function NewsList({
  title,
  items,
  loading = false,
  error = null,
  emptyMessage = "Sin noticias recientes.",
  highlightSymbols,
  dense = false,
}: NewsListProps) {
  const highlightSet = useMemo(() => {
    if (!highlightSymbols || highlightSymbols.length === 0) return null;
    return new Set(highlightSymbols.map((s) => s.toUpperCase()));
  }, [highlightSymbols]);

  if (loading) {
    return (
      <div className="space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="text-xs opacity-60">Cargando…</span>
        </header>
        <div className="space-y-2">
          <div className="h-16 rounded-lg bg-white/5 animate-pulse" />
          <div className="h-16 rounded-lg bg-white/5 animate-pulse" />
          <div className="h-16 rounded-lg bg-white/5 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="text-xs opacity-60">Error</span>
        </header>
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="space-y-2">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
        </header>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm opacity-75">{emptyMessage}</div>
      </div>
    );
  }

  const listSpacingClass = dense ? "space-y-2" : "space-y-3";

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs opacity-60">Actualizado {new Date().toLocaleTimeString()}</span>
      </header>
      <ul className={listSpacingClass}>
        {items.map((item) => {
          const relative = formatRelative(item.publishedAt);
          return (
            <li key={item.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold leading-snug hover:text-[--primary] transition-colors"
                  >
                    {item.title}
                  </a>
                  {relative && <span className="text-[11px] opacity-60 whitespace-nowrap">{relative}</span>}
                </div>
                {item.summary && (
                  <p className="text-xs opacity-75 leading-relaxed line-clamp-3">{item.summary}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-[11px] opacity-70">
                  {item.source && <span>{item.source}</span>}
                  {item.sentiment && <span className="px-1.5 py-0.5 rounded-full bg-white/5">{item.sentiment}</span>}
                  {item.symbols && item.symbols.length > 0 && (
                    <span>
                      {item.symbols.map((sym) =>
                        highlightSet && highlightSet.has(sym.toUpperCase()) ? (
                          <strong key={`${item.id}-${sym}`} className="mr-1">
                            {sym}
                          </strong>
                        ) : (
                          <span key={`${item.id}-${sym}`} className="mr-1">
                            {sym}
                          </span>
                        ),
                      )}
                    </span>
                  )}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-[11px] text-[--primary] hover:underline"
                  >
                    Ver nota completa
                  </a>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
