import type { Metadata } from "next";
import Script from "next/script";
import dynamic from "next/dynamic";
import "./globals.css";
import { HealthProvider } from "@/app/components/HealthContext";
import { ToastProvider } from "@/app/components/toast/ToastProvider";

// ⬇️ Importa como client-only los que probablemente usan window/localStorage o mutan DOM
const AppBoot = dynamic(() => import("@/app/components/AppBoot"), { ssr: false });
const SessionGate = dynamic(() => import("@/app/components/SessionGate"), { ssr: false });
const NavBar = dynamic(() => import("@/app/components/NavBar"), { ssr: false });

export const metadata: Metadata = {
  title: "AURA — IA financiera",
  description: "Tesis AURA: modelo predictivo financiero y paper trading.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Fija el tema ANTES de hidratar para que SSR y CSR coincidan */}
        <Script id="aura-theme" strategy="beforeInteractive">
          {`
            (function(){
              try {
                var v = localStorage.getItem('aura:theme');
                if (v === 'day') document.documentElement.setAttribute('data-theme','day');
              } catch (e) {}
            })();
          `}
        </Script>
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <ToastProvider>
          <HealthProvider>
            {/* Estos tres solo se renderizan en el cliente → sin riesgo de mismatch */}
            <AppBoot />
            <SessionGate>
              <NavBar />
              {children}
            </SessionGate>
          </HealthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
