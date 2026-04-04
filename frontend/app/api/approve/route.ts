import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { CONTRACTS, INFERENCE_GUARD_ABI } from "@/lib/contracts";

// POST /api/approve
// Relayer submits the AI verdict on-chain
// Body: { txHash, rootHash, execute }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { txHash, rootHash, execute, guardAddress } = body;

    if (!txHash || !rootHash || execute === undefined) {
      return NextResponse.json(
        { error: "Missing txHash, rootHash, or execute" },
        { status: 400 }
      );
    }

    const guard = guardAddress || CONTRACTS.INFERENCE_GUARD;
    if (!guard) {
      return NextResponse.json({ error: "INFERENCE_GUARD address not configured" }, { status: 500 });
    }

    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKey) {
      return NextResponse.json({ error: "RELAYER_PRIVATE_KEY required" }, { status: 500 });
    }

    // Ensure rootHash is valid bytes32 (0x-prefixed, 32 bytes)
    const rootHashHex = rootHash.startsWith("0x") ? rootHash : `0x${rootHash}`;
    if (rootHashHex.length !== 66) {
      return NextResponse.json(
        { error: `Invalid rootHash length: got ${rootHashHex.length} chars, expected 66 (0x + 64 hex)` },
        { status: 400 }
      );
    }

    console.log("[APPROVE] txHash:", txHash, "rootHash:", rootHashHex, "execute:", execute, "guard:", guard);

    const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const relayerWallet = new ethers.Wallet(relayerKey, provider);

    const guardContract = new ethers.Contract(guard, INFERENCE_GUARD_ABI, relayerWallet);
    const tx = await guardContract.approveTransaction(txHash, rootHashHex, execute);
    const receipt = await tx.wait();

    return NextResponse.json({
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      approved: execute,
    });
  } catch (error: unknown) {
    // Extract revert reason from ethers error
    let message = "Unknown error";
    if (error instanceof Error) {
      message = error.message;
      // ethers v6 wraps revert reasons in the error
      const revertMatch = message.match(/reason="([^"]+)"/);
      if (revertMatch) message = revertMatch[1];
    }
    console.error("[APPROVE] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
