// src/app/amplify-init.tsx
'use client';
import { useEffect, useRef } from 'react';
import { Amplify } from 'aws-amplify';
import { amplifyConfig } from '@/lib/amplify-config';

export default function AmplifyInit() {
  const done = useRef(false);
  useEffect(() => {
    if (!done.current) {
      Amplify.configure(amplifyConfig);
      done.current = true;
      if (process.env.NODE_ENV !== 'production') {
        console.log('[AURA] Amplify.configure hecho');
      }
    }
  }, []);
  return null;
}
