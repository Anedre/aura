"use client";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export default function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <main className="min-h-dvh grid lg:grid-cols-2">
      {/* Lado marca */}
      <section className="relative hidden lg:block">
        <div className="absolute inset-0">
          <div className="aura-orb -top-20 -left-10" />
          <div className="aura-orb aura-orb--accent -bottom-20 -right-10" />
        </div>
        <div className="relative z-10 h-full grid place-items-center p-12">
          <div className="max-w-md space-y-6">
            <div className="w-14 h-14 rounded-2xl border border-white/10 grid place-items-center bg-white/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/favicon.ico" alt="AURA" className="w-7 h-7" />
            </div>
            <h1 className="text-4xl font-extrabold leading-tight">
              AURA
              <span className="block text-base font-medium opacity-80 mt-2">
                IA financiera para recomendaciones en mercados líquidos
              </span>
            </h1>
            <p className="opacity-80">
              Modelo híbrido <strong>CNN–LSTM</strong> con estimación de incertidumbre y simulador de <em>paper trading</em>.
            </p>
            <ul className="text-sm opacity-80 space-y-1">
              <li>• Señales con umbral de confianza</li>
              <li>• Abstención operativa bajo alta incertidumbre</li>
              <li>• Validación contra <em>buy & hold</em></li>
            </ul>
          </div>
        </div>
      </section>

      {/* Lado formulario */}
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="card p-6">
            <div className="mb-5">
              <h2 className="text-xl font-semibold">{title}</h2>
              {subtitle && <p className="text-sm opacity-80 mt-1">{subtitle}</p>}
            </div>
            {children}
          </div>
          {footer && <div className="text-sm opacity-90 mt-4">{footer}</div>}
        </div>
      </section>
    </main>
  );
}
