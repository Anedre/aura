import { NextResponse } from "next/server";
import crypto from "crypto";

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

export async function GET() {
  const domain   = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;
  const redirect = process.env.COGNITO_REDIRECT_URI!;
  const scope    = encodeURIComponent("openid email profile");

  // PKCE
  const verifier  = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state     = b64url(crypto.randomBytes(24));

  const authUrl = `https://${domain}/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&scope=${scope}&code_challenge_method=S256&code_challenge=${challenge}&state=${state}`;

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(`${process.env.COOKIE_NAME_PREFIX}_pkce`, verifier, { httpOnly:true, secure:true, sameSite:"lax", path:"/", maxAge:300 });
  res.cookies.set(`${process.env.COOKIE_NAME_PREFIX}_state`, state,   { httpOnly:true, secure:true, sameSite:"lax", path:"/", maxAge:300 });
  return res;
}
