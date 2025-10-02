'use client';

import { ReactNode, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Mueve los providers y los componentes que tocan window/localStorage aquí
import { HealthProvider } from '@/app/components/HealthContext';
import { ToastProvider } from '@/app/components/toast/ToastProvider';

const AppBoot = dynamic(() => import('@/app/components/AppBoot'), { ssr: false });
const SessionGate = dynamic(() => import('@/app/components/SessionGate'), { ssr: false });
const NavBar = dynamic(() => import('@/app/components/NavBar'), { ssr: false });

export default function ClientLayoutShell({ children }: { children: ReactNode }) {
  // Gate de hidratación para evitar cualquier diff SSR/CSR
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;

  return (
    <ToastProvider>
      <HealthProvider>
        <AppBoot />
        <SessionGate>
          <NavBar />
          {children}
        </SessionGate>
      </HealthProvider>
    </ToastProvider>
  );
}
