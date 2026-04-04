import { NextRequest, NextResponse } from "next/server";
import { getAgent, updateAgentPromptOnChain, updateAgentPriceOnChain } from "@/lib/agents";
import { fetchFrom0G, storeOn0G } from "@/lib/og-inference";
import { ethers } from "ethers";

// GET /api/agents/[id] — Get single agent details + prompt text
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = await getAgent(id);

    // Fetch prompt template from 0G Storage
    let promptTemplate: string | null = null;
    try {
      const raw = await fetchFrom0G(agent.promptCid);
      const parsed = JSON.parse(raw);
      promptTemplate = parsed.promptTemplate ?? raw;
    } catch {
      // Prompt fetch is best-effort; agent metadata is still returned
    }

    return NextResponse.json({
      ...agent,
      pricePerInference: ethers.formatEther(agent.pricePerInference),
      promptTemplate,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("AgentNotFound")) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/agents/[id] — Update agent prompt
// Body: { promptTemplate }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { promptTemplate } = body;

    if (!promptTemplate) {
      return NextResponse.json(
        { error: "promptTemplate is required" },
        { status: 400 }
      );
    }

    // 1. Store new prompt on 0G Storage
    const { rootHash: newPromptCid } = await storeOn0G({ promptTemplate });

    // 2. Update prompt on-chain
    const txHash = await updateAgentPromptOnChain(id, newPromptCid);

    // 3. Update price on-chain if provided
    const { pricePerInference } = body;
    if (pricePerInference !== undefined) {
      const priceWei = ethers.parseEther(String(pricePerInference));
      await updateAgentPriceOnChain(id, priceWei);
    }

    return NextResponse.json({ agentId: id, promptCid: newPromptCid, txHash });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("NotCreator")) {
      return NextResponse.json({ error: "Not the agent creator" }, { status: 403 });
    }
    if (message.includes("AgentNotFound")) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
