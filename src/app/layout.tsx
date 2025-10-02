import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import SessionGate from "@/app/components/SessionGate";
import NavBar from "@/app/components/NavBar";
import AppBoot from "@/app/components/AppBoot";
import { HealthProvider } from "@/app/components/HealthContext";
import { ToastProvider } from "@/app/components/toast/ToastProvider";

export const metadata: Metadata = {
  title: "AURA — IA financiera",
  description: "Tesis AURA: modelo predictivo financiero y paper trading.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Aplica 'day' ANTES de hidratar para evitar mismatch (no toca SSR) */}
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
