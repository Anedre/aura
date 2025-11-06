// app/components/onboarding/WelcomeTerms.tsx
"use client";

import { useState } from "react";

/**
 * WelcomeTerms - Pantalla de bienvenida y aceptación de términos (HU-A1)
 * 
 * Gherkin:
 * Given que abro la app por primera vez
 * When avanzo hasta la pantalla de términos y toco "Acepto"
 * Then el botón "Continuar" se habilita
 * And soy dirigido al tutorial introductorio
 */

interface WelcomeTermsProps {
  onAccept: () => void;
}

export function WelcomeTerms({ onAccept }: WelcomeTermsProps) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 shadow-2xl">
        {/* Logo/Brand */}
        <div className="mb-6 text-center">
          <div className="mb-2 text-4xl font-bold text-[color:var(--primary)]">
            AURA
          </div>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Asistente Unificado de Recomendaciones Accionables
          </p>
        </div>

        {/* Descripción */}
        <div className="mb-6 space-y-3 text-sm">
          <p className="text-[color:var(--foreground)]">
            <strong>Bienvenido a AURA.</strong> Tu asistente inteligente para seguir activos del mercado de valores peruano.
          </p>
          <p className="text-[color:var(--muted-foreground)]">
            Recibe señales de compra/venta, crea alertas personalizadas y practica con trading simulado.
          </p>
        </div>

        {/* Términos */}
        <div className="mb-6 rounded-lg border border-[color:var(--border)] bg-[color:var(--muted)] p-4">
          <h3 className="mb-2 text-sm font-semibold">Términos de uso</h3>
          <div className="space-y-2 text-xs text-[color:var(--muted-foreground)]">
            <p>
              • Esta aplicación proporciona información educativa y no constituye asesoría financiera
            </p>
            <p>
              • Las señales son predicciones automáticas y pueden no ser precisas
            </p>
            <p>
              • El trading simulado usa datos de demostración
            </p>
            <p>
              • Acepto el procesamiento de datos según la <a href="/privacy" className="text-[color:var(--primary)] underline">Política de Privacidad</a>
            </p>
          </div>
        </div>

        {/* Checkbox */}
        <label className="mb-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 h-4 w-4 cursor-pointer accent-[color:var(--primary)]"
          />
          <span className="text-sm">
            He leído y acepto los términos de uso y la política de privacidad
          </span>
        </label>

        {/* CTA */}
        <button
          type="button"
          disabled={!accepted}
          onClick={onAccept}
          className="w-full rounded-lg bg-[color:var(--primary)] px-4 py-3 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continuar
        </button>

        <p className="mt-3 text-center text-xs text-[color:var(--muted-foreground)]">
          Al continuar, aceptas nuestros términos
        </p>
      </div>
    </div>
  );
}
