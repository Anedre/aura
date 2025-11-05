// src/app/layout.tsx
import "./globals.css";
import Providers from "./providers";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "AURA",
  description: "IA financiera para recomendaciones en mercados líquidos",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // Importante para safe areas
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
