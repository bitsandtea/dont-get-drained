import { NextRequest, NextResponse } from "next/server";
import { storeOn0G } from "@/lib/og-inference";
import { listEntries, addEntry } from "@/lib/storage-index";

// GET — list all files (optionally filter by ?wallet=)
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet") || undefined;
  const entries = listEntries(wallet);
  return NextResponse.json(entries);
}

// POST — upload data to 0G storage and index it
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, data, wallet, contentType } = body as {
      name: string;
      data: unknown;
      wallet: string;
      contentType?: string;
    };

    if (!name || !data || !wallet) {
      return NextResponse.json(
        { error: "name, data, and wallet are required" },
        { status: 400 }
      );
    }

    const payload = typeof data === "string" ? { text: data } : data;
    const jsonStr = JSON.stringify(payload, null, 2);

    const result = await storeOn0G(payload as object);

    addEntry({
      rootHash: result.rootHash,
      txHash: result.txHash,
      submissionIndex: result.submissionIndex,
      name,
      size: new TextEncoder().encode(jsonStr).length,
      wallet,
      timestamp: Date.now(),
      contentType: contentType || "application/json",
    });

    return NextResponse.json({
      ...result,
      name,
      size: new TextEncoder().encode(jsonStr).length,
    });
  } catch (e) {
    console.error("[og-storage] Upload failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
