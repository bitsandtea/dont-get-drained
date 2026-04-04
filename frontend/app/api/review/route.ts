import { NextRequest, NextResponse } from "next/server";
import { computeGuardTxHash } from "@/lib/guard";
import { CONTRACTS, TOKENS } from "@/lib/contracts";
import { runInference, storeOn0G } from "@/lib/og-inference";
import { getSwapQuote } from "@/lib/uniswap";
import { getPromptTemplate, renderPrompt } from "@/lib/prompt-store";
import { ethers } from "ethers";

// ETH native address for the Trading API
const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";

// POST /api/review
// Submit a swap transaction for AI review via 0G inference
// Body: { tokenOut, amountIn, recipient }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tokenOut, amountIn, recipient } = body;

    if (!tokenOut || !amountIn || !recipient) {
      return NextResponse.json({ error: "Missing tokenOut, amountIn, or recipient" }, { status: 400 });
    }

    const amountInWei = ethers.parseEther(amountIn.toString()).toString();

    // Resolve token decimals
    const tokenEntry = Object.values(TOKENS).find(
      (t) => t.address.toLowerCase() === tokenOut.toLowerCase()
    );
    const tokenOutDecimals = tokenEntry?.decimals ?? 18;

    // Get quote + executable tx from Uniswap Trading API
    const uniQuote = await getSwapQuote({
      tokenIn: ETH_ADDRESS,
      tokenOut,
      amountInWei,
      swapper: recipient,
      tokenOutDecimals,
    });

    // Compute guard tx hash from the actual transaction the user will sign
    const guardTxHash = computeGuardTxHash({
      to: uniQuote.tx.to,
      value: BigInt(uniQuote.tx.value),
      data: uniQuote.tx.data,
    });

    // Build prompt for 0G inference
    const tokenSymbol = tokenEntry?.symbol ?? tokenOut;
    const prompt = renderPrompt(getPromptTemplate(), {
      amountIn: String(amountIn),
      outputAmount: uniQuote.outputAmount,
      tokenSymbol,
      tokenOut,
      recipient,
      routing: uniQuote.routing,
      gasFeeUSD: uniQuote.gasFeeUSD,
      txTarget: uniQuote.tx.to,
      USDC: CONTRACTS.USDC,
      DAI: CONTRACTS.DAI,
      WETH: CONTRACTS.WETH,
    });

    // Call 0G inference
    const inference = await runInference(prompt);
    console.log("[REVIEW] Raw AI answer:", JSON.stringify(inference.answer));

    // Parse JSON verdict from AI answer
    let verdict = false;
    let notes = inference.answer;
    try {
      const jsonMatch = inference.answer.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log("[REVIEW] Parsed JSON:", JSON.stringify(parsed));
        verdict = parsed.approved === 1;
        notes = parsed.notes || inference.answer;
      }
    } catch (e) {
      // Fallback: treat as rejected if JSON parsing fails
      console.log("[REVIEW] JSON parse failed:", e instanceof Error ? e.message : e);
      verdict = false;
      notes = `Failed to parse AI response: ${inference.answer}`;
    }

    // Build full result for storage
    const fullResult = {
      timestamp: new Date().toISOString(),
      guardTxHash,
      swapParams: { tokenOut, amountIn, recipient, quote: uniQuote.outputAmount },
      uniswap: { routing: uniQuote.routing, gasFeeUSD: uniQuote.gasFeeUSD },
      inference: {
        model: inference.model,
        provider: inference.provider,
        chatId: inference.chatId,
        answer: inference.answer,
        verdict,
        verified: inference.verified,
        teeProof: inference.teeProof,
      },
    };

    // Store on 0G Storage
    const storage = await storeOn0G(fullResult);

    // Simulate asset changes via Alchemy
    let simulation = null;
    const alchemyUrl = process.env.ALCHEMY_RPC_URL;
    if (alchemyUrl && !alchemyUrl.includes("YOUR_ALCHEMY_KEY")) {
      try {
        const simValue = uniQuote.tx.value.startsWith("0x")
          ? uniQuote.tx.value
          : "0x" + BigInt(uniQuote.tx.value).toString(16);

        const simRes = await fetch(alchemyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: 1,
            jsonrpc: "2.0",
            method: "alchemy_simulateAssetChanges",
            params: [
              {
                from: recipient,
                to: uniQuote.tx.to,
                value: simValue,
                data: uniQuote.tx.data,
              },
            ],
          }),
        });

        const simData = await simRes.json();
        if (simData.result) {
          simulation = simData.result;
          console.log("[REVIEW] Alchemy simulation:", JSON.stringify(simulation, null, 2));
        } else if (simData.error) {
          console.warn("[REVIEW] Alchemy simulation error:", simData.error);
        }
      } catch (e) {
        console.warn("[REVIEW] Alchemy simulation failed:", e instanceof Error ? e.message : e);
      }
    } else {
      console.log("[REVIEW] Skipping Alchemy simulation — ALCHEMY_RPC_URL not configured");
    }

    return NextResponse.json({
      txHash: guardTxHash,
      swapTx: uniQuote.tx,
      verdict,
      quote: uniQuote.outputAmount,
      gasFeeUSD: uniQuote.gasFeeUSD,
      routing: uniQuote.routing,
      aiAnswer: notes,
      teeProof: inference.teeProof,
      verified: inference.verified,
      rootHash: storage.rootHash,
      storageTxHash: storage.txHash,
      simulation,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
