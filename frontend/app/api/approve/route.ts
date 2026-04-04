import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { CONTRACTS, AI_GUARD_ABI } from "@/lib/contracts";

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

    const guard = guardAddress || CONTRACTS.AI_GUARD;
    if (!guard) {
      return NextResponse.json({ error: "AI_GUARD address not configured" }, { status: 500 });
    }

    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKey) {
      return NextResponse.json({ error: "RELAYER_PRIVATE_KEY required" }, { status: 500 });
    }

    const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const relayerWallet = new ethers.Wallet(relayerKey, provider);

    const guardContract = new ethers.Contract(guard, AI_GUARD_ABI, relayerWallet);
    const tx = await guardContract.approveTransaction(txHash, rootHash, execute);
    const receipt = await tx.wait();

    return NextResponse.json({
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      approved: execute,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
