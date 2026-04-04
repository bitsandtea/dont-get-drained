import { NextRequest, NextResponse } from "next/server";
import { listAgents, registerAgentOnChain } from "@/lib/agents";
import { storeOn0G } from "@/lib/og-inference";

export async function GET() {
  try {
    const agents = await listAgents();
    // Serialize bigint fields to string for JSON
    const serialized = agents.map((a) => ({
      ...a,
      pricePerInference: a.pricePerInference.toString(),
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
    const { name, description, promptTemplate, pricePerInference, capabilities } = body;

    if (!name || !promptTemplate) {
      return NextResponse.json(
        { error: "name and promptTemplate are required" },
        { status: 400 }
      );
    }

    // 1. Store promptTemplate on 0G Storage
    const { rootHash: promptCid } = await storeOn0G({ promptTemplate });

    // 2. Register on AgentDirectory contract
    const { agentId, tx: txHash } = await registerAgentOnChain({
      name,
      description: description || "",
      promptCid,
      pricePerInference: BigInt(pricePerInference || 0),
      capabilities: capabilities || "",
    });

    return NextResponse.json({ agentId, promptCid, name, txHash }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
