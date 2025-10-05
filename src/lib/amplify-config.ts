"use client";

import { Amplify } from "aws-amplify";

/**
 * Configura Amplify (Auth→Cognito) una sola vez en el browser.
 * - No usamos `region` (en v6 no es parte del tipo Cognito).
 * - Evitamos pasar `string | undefined` a configure.
 */
let configured = false;

export function setupAmplify(): void {
  if (configured) return;

  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const userPoolClientId =
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID ??
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_WEB_CLIENT_ID;

  if (!userPoolId || !userPoolClientId) {
    console.error("[AURA/Auth] Faltan variables Cognito:", {
      NEXT_PUBLIC_COGNITO_USER_POOL_ID: userPoolId,
      NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID: userPoolClientId,
    });
    configured = true; // no reintenta en este ciclo
    return;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        loginWith: { email: true, username: true },
        signUpVerificationMethod: "code",
        // identityPoolId y allowGuestAccess son opcionales si luego habilitas guest
      },
    },
  });

  configured = true;
}
