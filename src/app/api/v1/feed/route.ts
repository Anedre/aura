import { NextResponse } from "next/server"

export async function GET() {
  const now = new Date().toISOString()
  return NextResponse.json([
    {
      symbol: "BTC-USD",
      ts: now,
      action: "BUY",
      p_conf: 0.63,
      sigma: 0.18,
      horizon: "1d",
      stops: { tp: 3.0, sl: 1.2 },
      model_version: "cnn-lstm-v1.2"
    },
    {
      symbol: "ETH-USD",
      ts: now,
      action: "HOLD",
      p_conf: 0.58,
      sigma: 0.22,
      horizon: "1d",
      stops: { tp: 2.0, sl: 1.0 },
      model_version: "cnn-lstm-v1.2"
    },
    {
      symbol: "AAPL",
      ts: now,
      action: "ABSTAIN",
      p_conf: 0.51,
      sigma: 0.35,
      horizon: "1d",
      model_version: "cnn-lstm-v1.2"
    }
  ])
}
