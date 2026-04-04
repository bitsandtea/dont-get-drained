import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { listAgents, registerAgentOnChain } from "@/lib/agents";
import { storeOn0G } from "@/lib/og-inference";

export async function GET() {
  try {
    const agents = await listAgents();
    // Serialize bigint fields to string for JSON
    const serialized = agents.map((a) => ({
      ...a,
      pricePerInference: ethers.formatEther(a.pricePerInference),
    }));
    return NextResponse.json(serialized);
  } catch (e) {
    console.error("Failed to list agents:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch agents" },
      { status: 500 }
    );
  }
}

// POST /api/agents — Register a new agent
// Body: { name, description, promptTemplate, pricePerInference, capabilities }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, promptTemplate, steps, dataSources, pricePerInference, capabilities } = body;

    // Validate: either a single promptTemplate or a steps array
    const hasSteps = Array.isArray(steps) && steps.length > 0;
    if (!name || (!promptTemplate && !hasSteps)) {
      return NextResponse.json(
        { error: "name and either promptTemplate or steps are required" },
        { status: 400 }
      );
    }

    if (hasSteps && steps.length > 8) {
      return NextResponse.json({ error: "Maximum 8 steps allowed" }, { status: 400 });
    }

    // 1. Store on 0G Storage — step flow or single prompt
    const storagePayload = hasSteps
      ? { steps, dataSources: dataSources || [] }
      : { promptTemplate };
    const { rootHash: promptCid, submissionIndex } = await storeOn0G(storagePayload);

    // 2. Register on AgentDirectory contract
    const { agentId, tx: txHash } = await registerAgentOnChain({
      name,
      description: description || "",
      promptCid,
      pricePerInference: ethers.parseEther(String(pricePerInference || "0")),
      capabilities: capabilities || "",
    });

    return NextResponse.json({ agentId, promptCid, name, txHash, submissionIndex }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
