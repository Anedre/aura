import { NextRequest, NextResponse } from "next/server";

const REMOTE_BASE = [process.env.NEXT_PUBLIC_AURA_API, process.env.NEXT_PUBLIC_API_BASE]
  .find((v) => typeof v === "string" && v.trim().length > 0)
  ?.replace(/\/+$/, "");

export async function GET(request: NextRequest) {
  if (!REMOTE_BASE) {
    return NextResponse.json({ error: "AURA API no configurada" }, { status: 500 });
  }

  const upstream = `${REMOTE_BASE}/v1/feed${request.nextUrl.search}`;
  const headers = new Headers();
  headers.set("accept", "application/json");
  const auth = request.headers.get("authorization");
  if (auth) headers.set("authorization", auth);

  try {
    const res = await fetch(upstream, { method: "GET", headers, cache: "no-store" });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
