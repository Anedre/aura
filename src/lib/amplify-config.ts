// src/lib/amplify-config.ts
const ENV = {
  REGION: process.env.NEXT_PUBLIC_COGNITO_REGION ?? '',
  USER_POOL_ID: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? '',
  WEB_CLIENT_ID: process.env.NEXT_PUBLIC_COGNITO_WEB_CLIENT_ID ?? '',
};

// 🔐: en prod no truenes la app por una env perdida; loguea y usa fallback seguro.
const warn = (k: string) => {
  // eslint-disable-next-line no-console
  console.warn(`[AURA] Falta variable ${k} en build. Revisa Amplify Hosting → Variables de entorno.`);
};

if (!ENV.REGION) warn('NEXT_PUBLIC_COGNITO_REGION');
if (!ENV.USER_POOL_ID) warn('NEXT_PUBLIC_COGNITO_USER_POOL_ID');
if (!ENV.WEB_CLIENT_ID) warn('NEXT_PUBLIC_COGNITO_WEB_CLIENT_ID');

// Fallback ‘us-east-1’ es aceptable si tu pool está en us-east-1 (como en tus capturas).
export const amplifyConfig = {
  Auth: {
    Cognito: {
      region: ENV.REGION || 'us-east-1',
      userPoolId: ENV.USER_POOL_ID,
      userPoolClientId: ENV.WEB_CLIENT_ID,
      // loginWith: { email: true }, // opcional
    },
  },
};

// Pequeño log para validar qué entró al bundle (no imprime secretos).
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  console.log('[AURA][AmplifyConfig]',
    {
      region: ENV.REGION || 'us-east-1',
      userPoolId_last6: ENV.USER_POOL_ID?.slice(-6),
      webClientId_first6: ENV.WEB_CLIENT_ID?.slice(0, 6),
    }
  );
}
