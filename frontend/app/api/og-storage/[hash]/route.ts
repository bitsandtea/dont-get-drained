import { NextRequest, NextResponse } from "next/server";
import { fetchFrom0G } from "@/lib/og-inference";
import { getEntry } from "@/lib/storage-index";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  const { hash } = await params;
  try {
    const entry = getEntry(hash);
    const content = await fetchFrom0G(hash);
    return NextResponse.json({ content, entry: entry || null });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Fetch failed" },
      { status: 500 }
    );
  }
}
