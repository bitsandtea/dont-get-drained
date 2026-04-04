import { NextRequest, NextResponse } from "next/server";
import { TOKENS } from "@/lib/contracts";
import { getQuotePreview, ETH_ADDRESS } from "@/lib/uniswap";
import { ethers } from "ethers";

// A default swapper address for quote-only requests (doesn't need to be the actual user)
const QUOTE_SWAPPER = "0x0000000000000000000000000000000000000001";

// POST /api/quote
// Lightweight quote preview — no executable tx, just pricing
// Body: { tokenIn?, tokenOut, amountIn, recipient? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tokenIn: rawTokenIn, tokenOut, amountIn, recipient } = body;
    const tokenIn = rawTokenIn || ETH_ADDRESS;

    if (!tokenOut || !amountIn) {
      return NextResponse.json({ error: "Missing tokenOut or amountIn" }, { status: 400 });
    }

    const amount = parseFloat(amountIn);
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amountIn" }, { status: 400 });
    }

    const isEthIn = tokenIn === ETH_ADDRESS;
    const tokenInEntry = Object.values(TOKENS).find(
      (t) => t.address.toLowerCase() === tokenIn.toLowerCase()
    );
    const tokenInDecimals = isEthIn ? 18 : (tokenInEntry?.decimals ?? 18);

    const amountInWei = isEthIn
      ? ethers.parseEther(amount.toString()).toString()
      : ethers.parseUnits(amount.toString(), tokenInDecimals).toString();

    const tokenOutEntry = Object.values(TOKENS).find(
      (t) => t.address.toLowerCase() === tokenOut.toLowerCase()
    );
    const tokenOutDecimals = tokenOutEntry?.decimals ?? 18;

    const preview = await getQuotePreview({
      tokenIn,
      tokenOut,
      amountInWei,
      swapper: recipient || QUOTE_SWAPPER,
      tokenOutDecimals,
      amountInHuman: amount.toString(),
    });

    return NextResponse.json(preview);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
