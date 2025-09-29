import type { Metadata } from "next";
import "./globals.css";
import AppBoot from "@/app/components/AppBoot";
import NavBar from "@/app/components/NavBar";

export const metadata: Metadata = {
  title: "AURA — IA financiera",
  description: "Tesis AURA: modelo predictivo financiero y paper trading.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <AppBoot />
        <NavBar />
        {children}
      </body>
    </html>
  );
}
