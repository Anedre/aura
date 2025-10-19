"use client";

import React, { useMemo } from "react";

export type GlossaryEntry = {
  term: string;
  short: string; // mini concepto
  applies?: string; // cómo se aplica
  relates?: string[]; // términos relacionados
};

// Diccionario base (extensible). Claves en minúsculas para matching insensible a mayúsculas.
export const GLOSSARY: Record<string, GlossaryEntry> = {
  "volatilidad": {
    term: "Volatilidad",
    short: "Magnitud de las subidas y bajadas del precio en un periodo.",
    applies: "Ayuda a dimensionar riesgo y tamaño de posición.",
    relates: ["riesgo", "tendencia", "stop loss"],
  },
  "certeza": {
    term: "Certeza",
    short: "Nivel estimado de confianza de una predicción (0–100%).",
    applies: "Ajusta expectativas y gestión del riesgo.",
    relates: ["probabilidad", "modelo", "señal"],
  },
  "cierre": {
    term: "Cierre de operaciones",
    short: "Momento en que un mercado deja de cotizar en el día.",
    applies: "Define ventanas de evaluación y liquidación.",
    relates: ["mercado abierto", "sesión", "after hours"],
  },
  "mercado abierto": {
    term: "Mercado abierto",
    short: "Periodo en el que se pueden ejecutar órdenes en tiempo real.",
    applies: "La liquidez y spreads suelen ser mejores.",
    relates: ["cierre", "volatilidad", "liquidez"],
  },
  "apalancamiento": {
    term: "Apalancamiento",
    short: "Multiplica la exposición respecto al capital inmovilizado.",
    applies: "Aumenta potencial y también el riesgo de pérdidas.",
    relates: ["margen", "riesgo"],
  },
  "cnn–lstm": {
    term: "CNN–LSTM",
    short: "Arquitectura híbrida: extracción de patrones (CNN) + memoria temporal (LSTM).",
    applies: "Modela señales en series de tiempo financieras.",
    relates: ["modelo", "predicción", "incertidumbre"],
  },
  "incertidumbre": {
    term: "Incertidumbre (MC Dropout)",
    short: "Estimación de variabilidad en la predicción del modelo.",
    applies: "Permite calibrar riesgo y comunicar confianza.",
    relates: ["certeza", "modelo"],
  },
  "simulador": {
    term: "Simulador",
    short: "Herramienta para probar ideas con datos reales sin dinero.",
    applies: "Aprendizaje y validación de estrategias.",
    relates: ["paper trading", "riesgo"],
  },
  "liquidez": {
    term: "Liquidez",
    short: "Facilidad para comprar o vender sin mover mucho el precio.",
    applies: "Mercados con alta liquidez suelen tener spreads más bajos.",
    relates: ["volatilidad", "slippage"],
  },
  "riesgo": {
    term: "Riesgo",
    short: "Posibilidad de que el resultado sea distinto al esperado.",
    applies: "Se gestiona con tamaño de posición y diversificación.",
    relates: ["volatilidad", "certeza"],
  },
  "horizonte": {
    term: "Horizonte",
    short: "Periodo de tiempo al que apunta una idea de inversión.",
    applies: "Diario, semanal o a más largo plazo.",
    relates: ["cierre", "volatilidad"],
  },
  "índice": {
    term: "Índice",
    short: "Cesta representativa de activos (p. ej., S&P 500).",
    applies: "Sirve de referencia para rendimiento del mercado.",
    relates: ["ETF", "diversificación"],
  },
  "etf": {
    term: "ETF",
    short: "Fondo cotizado que replica un índice o estrategia.",
    applies: "Permite diversificar con una sola compra.",
    relates: ["índice", "riesgo"],
  },
};

export function TechTerm({ term, label }: { term: string; label?: string }) {
  const key = term.toLowerCase();
  const entry = GLOSSARY[key];
  if (!entry) return <span>{label ?? term}</span>;

  return (
    <span className="tech-term" data-term={entry.term}>
      {label ?? entry.term}
      <span className="tech-term__tooltip" role="tooltip">
        <div className="tech-term__title">{entry.term}</div>
        <div className="tech-term__body">{entry.short}</div>
        {entry.applies && <div className="tech-term__applies">Uso: {entry.applies}</div>}
        {entry.relates && entry.relates.length > 0 && (
          <div className="tech-term__relates">Relacionado: {entry.relates.join(", ")}</div>
        )}
      </span>
    </span>
  );
}

// Resalta automáticamente ocurrencias de términos del glosario en un texto plano.
export function GlossaryText({ text }: { text: string }) {
  const nodes = useMemo(() => {
    const terms = Object.keys(GLOSSARY);
    if (terms.length === 0) return [text];
    // Ordenar por longitud desc para evitar solapamientos (p.ej. "cierre" dentro de "cierre de operaciones")
    const sorted = terms.sort((a, b) => b.length - a.length).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`(${sorted.join("|")})`, "gi");

    const parts: Array<string | { term: string; label: string }> = [];
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) != null) {
      const idx = m.index;
      const match = m[0];
      if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));
      parts.push({ term: match.toLowerCase(), label: match });
      lastIndex = idx + match.length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
  }, [text]);

  return (
    <>
      {nodes.map((p, i) =>
        typeof p === "string" ? (
          <React.Fragment key={i}>{p}</React.Fragment>
        ) : (
          <TechTerm key={i} term={p.term} label={p.label} />
        )
      )}
    </>
  );
}
