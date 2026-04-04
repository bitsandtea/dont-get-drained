import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { CONTRACTS, INFERENCE_GUARD_ABI } from "@/lib/contracts";

// GET /api/status?txHash=0x...
// Check if a transaction has been approved by the AI guard
export async function GET(req: NextRequest) {
  try {
    const txHash = req.nextUrl.searchParams.get("txHash");
    const guardAddr = req.nextUrl.searchParams.get("guardAddress") || CONTRACTS.INFERENCE_GUARD;
    if (!txHash) {
      return NextResponse.json({ error: "Missing txHash parameter" }, { status: 400 });
    }

    if (!guardAddr) {
      return NextResponse.json({ error: "INFERENCE_GUARD address not configured" }, { status: 500 });
    }

    const rpcUrl = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const guard = new ethers.Contract(guardAddr, INFERENCE_GUARD_ABI, provider);

    const isApproved = await guard.isApproved(txHash);
    const approval = await guard.approvals(txHash);

    return NextResponse.json({
      txHash,
      approved: approval.approved,
      consumed: approval.consumed,
      isApproved, // approved && !consumed
      rootHash: approval.rootHash,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
