import { NextRequest, NextResponse } from "next/server";
import { TOKENS } from "@/lib/contracts";
import { getQuotePreview } from "@/lib/uniswap";
import { ethers } from "ethers";

const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";

// A default swapper address for quote-only requests (doesn't need to be the actual user)
const QUOTE_SWAPPER = "0x0000000000000000000000000000000000000001";

// POST /api/quote
// Lightweight quote preview — no executable tx, just pricing
// Body: { tokenOut, amountIn, recipient? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tokenOut, amountIn, recipient } = body;

    if (!tokenOut || !amountIn) {
      return NextResponse.json({ error: "Missing tokenOut or amountIn" }, { status: 400 });
    }

    const amount = parseFloat(amountIn);
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amountIn" }, { status: 400 });
    }

    const amountInWei = ethers.parseEther(amount.toString()).toString();

    const tokenEntry = Object.values(TOKENS).find(
      (t) => t.address.toLowerCase() === tokenOut.toLowerCase()
    );
    const tokenOutDecimals = tokenEntry?.decimals ?? 18;

    const preview = await getQuotePreview({
      tokenIn: ETH_ADDRESS,
      tokenOut,
      amountInWei,
      swapper: recipient || QUOTE_SWAPPER,
      tokenOutDecimals,
      amountInEth: amount.toString(),
    });

    return NextResponse.json(preview);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
