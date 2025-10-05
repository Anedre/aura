'use client';

import { useEffect, useRef } from 'react';
import { setupAmplify } from '@/lib/amplify-config';

export default function AmplifyInit() {
  const done = useRef(false);
  useEffect(() => {
    if (!done.current) {
      setupAmplify(); // ← en lugar de Amplify.configure(amplifyConfig)
      done.current = true;
      if (process.env.NODE_ENV !== 'production') {
        console.log('[AURA] Amplify configurado');
      }
    }
  }, []);
  return null;
}
