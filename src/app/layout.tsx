import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import ClientLayoutShell from '@/app/components/ClientLayoutShell';

export const metadata: Metadata = {
  title: 'AURA — IA financiera',
  description: 'Tesis AURA: modelo predictivo financiero y paper trading.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Fija el tema antes de hidratar para que SSR y CSR coincidan */}
        <Script id="aura-theme" strategy="beforeInteractive">
          {`
            (function(){
              try {
                var v = localStorage.getItem('aura:theme');
                if (v === 'day') document.documentElement.setAttribute('data-theme','day');
              } catch {}
            })();
          `}
        </Script>
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {/* Todo lo que requiere cliente vive dentro del wrapper cliente */}
        <ClientLayoutShell>{children}</ClientLayoutShell>
      </body>
    </html>
  );
}
