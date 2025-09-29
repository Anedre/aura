import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const next  = url.searchParams.get("next") || "/profile";

  const prefix = process.env.COOKIE_NAME_PREFIX || "aura";
  const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!;
  const client = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;
  const redirect = process.env.COGNITO_REDIRECT_URI!;

  const cookies = (req as any).cookies ?? { get: () => null }; // edge compat
  const verifier = cookies.get?.(`${prefix}_pkce`)?.value || "";
  const savedState = cookies.get?.(`${prefix}_state`)?.value || "";

  if (!code || !verifier || state !== savedState) {
    return NextResponse.redirect(new URL("/login?e=state", url.origin));
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: client,
    code,
    redirect_uri: redirect,
    code_verifier: verifier,
  });

  const r = await fetch(`https://${domain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  if (!r.ok) {
    return NextResponse.redirect(new URL("/login?e=token", url.origin));
  }
  const tok = await r.json() as {
    id_token: string; access_token: string; refresh_token?: string;
    expires_in: number; token_type: string;
  };

  const res = NextResponse.redirect(new URL(next, url.origin));
  res.cookies.set(`${prefix}_id`, tok.id_token,         { httpOnly:true, secure:true, sameSite:"lax", path:"/", maxAge: tok.expires_in });
  res.cookies.set(`${prefix}_at`, tok.access_token,     { httpOnly:true, secure:true, sameSite:"lax", path:"/", maxAge: tok.expires_in });
  if (tok.refresh_token) {
    res.cookies.set(`${prefix}_rt`, tok.refresh_token,  { httpOnly:true, secure:true, sameSite:"lax", path:"/", maxAge: 30*24*3600 });
  }
  // limpia PKCE
  res.cookies.set(`${prefix}_pkce`, "", { httpOnly:true, secure:true, sameSite:"lax", path:"/", maxAge:0 });
  res.cookies.set(`${prefix}_state`,"", { httpOnly:true, secure:true, sameSite:"lax", path:"/", maxAge:0 });
  return res;
}
