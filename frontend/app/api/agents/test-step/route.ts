import { NextRequest, NextResponse } from "next/server";

// POST /api/agents/test-step — Test a curl step during agent creation
// Body: { url, method?, body? }
export async function POST(req: NextRequest) {
  try {
    const { url, method, body: reqBody } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const opts: RequestInit = { method: method || "GET" };
    if (method === "POST" && reqBody) {
      opts.body = typeof reqBody === "string" ? reqBody : JSON.stringify(reqBody);
      opts.headers = { "Content-Type": "application/json" };
    }

    const start = Date.now();
    const res = await fetch(url, opts);
    const text = await res.text();
    const elapsed = Date.now() - start;

    return NextResponse.json({
      status: res.status,
      elapsed,
      size: text.length,
      // Return first 2000 chars as preview
      preview: text.slice(0, 2000),
      truncated: text.length > 2000,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
