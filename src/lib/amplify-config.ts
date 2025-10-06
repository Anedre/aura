// src/lib/amplify-config.ts
'use client';

import { Amplify } from 'aws-amplify';

let configured = false;

export function setupAmplify(): void {
  if (configured) return;

  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? '';
  const userPoolClientId =
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID ??
    process.env.NEXT_PUBLIC_COGNITO_WEB_CLIENT_ID ??
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_WEB_CLIENT_ID ??
    '';

  if (!userPoolId || !userPoolClientId) {
    console.error('[AURA/Auth] Faltan variables Cognito:', {
      NEXT_PUBLIC_COGNITO_USER_POOL_ID: userPoolId || 'undefined',
      NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID:
        process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID || 'undefined',
      NEXT_PUBLIC_COGNITO_WEB_CLIENT_ID:
        process.env.NEXT_PUBLIC_COGNITO_WEB_CLIENT_ID || 'undefined',
      NEXT_PUBLIC_COGNITO_USER_POOL_WEB_CLIENT_ID:
        process.env.NEXT_PUBLIC_COGNITO_USER_POOL_WEB_CLIENT_ID || 'undefined',
    });
    configured = true;
    return;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,                // v6: “clientId” (no “Web”)
        loginWith: { email: true, username: true },
        signUpVerificationMethod: 'code',
      },
    },
  });

  configured = true;
}
