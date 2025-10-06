import type { NextRequest } from "next/server";
import WebSocket, { RawData } from "ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FinnhubTradeMsg = {
  type?: string;
  data?: Array<{ p: number; t: number; s: string; v?: number }>;
};

const encoder = new TextEncoder();
const sseData = (o: unknown) => encoder.encode(`data: ${JSON.stringify(o)}\n\n`);
const sseComment = (t: string) => encoder.encode(`: ${t}\n\n`);

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") ?? "";
  if (!symbol) return new Response("symbol requerido", { status: 400 });

  const token = process.env.FINNHUB_TOKEN;
  if (!token) return new Response("FINNHUB_TOKEN no configurado", { status: 500 });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let keep: ReturnType<typeof setInterval> | null = null;

      const push = (chunk: Uint8Array) => { if (!closed) { try { controller.enqueue(chunk); } catch {} } };
      const send = (obj: unknown) => push(sseData(obj));
      const comment = (txt: string) => push(sseComment(txt));

      const ws = new WebSocket(`wss://ws.finnhub.io?token=${token}`);

      const shutdown = (reason?: string) => {
        if (closed) return;
        closed = true;
        try { ws.send(JSON.stringify({ type: "unsubscribe", symbol })); } catch {}
        try { ws.close(); } catch {}
        if (keep) clearInterval(keep);
        try { controller.close(); } catch {}
        if (reason) { try { send({ status: "closing", reason }); } catch {} }
      };

      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "subscribe", symbol }));
        send({ status: "subscribed", symbol });
        keep = setInterval(() => {
          try { ws.send(JSON.stringify({ type: "ping" })); } catch {}
          comment("keep-alive");
        }, 10_000);
      });

      ws.on("message", (buf: RawData) => {
        if (closed) return;
        try {
          const msg = JSON.parse(buf.toString()) as FinnhubTradeMsg;
          if (msg.type === "trade" && Array.isArray(msg.data)) {
            for (const t of msg.data) {
              if (typeof t.p === "number" && typeof t.t === "number") {
                // reenviamos precio, timestamp y volumen (si existe)
                send({ t: t.t, p: t.p, v: typeof t.v === "number" ? t.v : undefined });
              }
            }
          }
        } catch {}
      });

      ws.on("error", (err) => shutdown(`ws-error: ${err instanceof Error ? err.message : String(err)}`));
      ws.on("close", () => shutdown("ws-close"));
      req.signal.addEventListener("abort", () => shutdown("client-abort"));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
