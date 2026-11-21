import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { text?: unknown } | null;
  if (typeof body?.text !== "string" || body.text.length > 4000) {
    return NextResponse.json({ ok: false, error: "INVALID_SYNTHETIC_SAMPLE" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, classification: "needs_review", proposals: [], processing: "synthetic_preview_only" });
}
