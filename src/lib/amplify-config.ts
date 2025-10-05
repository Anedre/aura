// src/lib/amplify-config.ts
import { ResourcesConfig } from "aws-amplify";

export const amplifyConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,        // ej: us-east-1_XXXX
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_WEB_CLIENT_ID!, // ej: 1h2jk3...
      signUpVerificationMethod: "code",
      loginWith: { // si usas email como username
        username: false,
        email: true,
        phone: false
      }
    }
  }
};
