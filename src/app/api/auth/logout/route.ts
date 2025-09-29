import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const prefix = process.env.COOKIE_NAME_PREFIX || "aura";
  const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!;
  const client = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;
  const logoutRedirect = process.env.COGNITO_LOGOUT_REDIRECT_URI!;

  const res = NextResponse.redirect(new URL(`https://${domain}/logout?client_id=${client}&logout_uri=${encodeURIComponent(logoutRedirect)}`, url.origin));
  // borra cookies
  for (const k of [`${prefix}_id`, `${prefix}_at`, `${prefix}_rt`]) {
    res.cookies.set(k, "", { httpOnly:true, secure:true, sameSite:"lax", path:"/", maxAge:0 });
  }
  return res;
}
