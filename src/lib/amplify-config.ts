// src/lib/amplify-config.ts
const must = (name: string) => {
  const v = process.env[name];
  if (!v) {
    // En build de Amplify esto falla temprano en consola y no llegas a prod roto
    throw new Error(`[AURA] Missing env ${name}`);
  }
  return v;
};

export const amplifyConfig = {
  Auth: {
    Cognito: {
      region: must('NEXT_PUBLIC_COGNITO_REGION'),
      userPoolId: must('NEXT_PUBLIC_COGNITO_USER_POOL_ID'),
      userPoolClientId: must('NEXT_PUBLIC_COGNITO_WEB_CLIENT_ID'),
      // opcional:
      // loginWith: { email: true },
    }
  }
};
