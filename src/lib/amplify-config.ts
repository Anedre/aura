// src/lib/amplify-config.ts
export const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_WEB_CLIENT_ID!,
      region: process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1',
      // opcional: loginWith: { email: true },
    },
  },
};
