import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { INFERENCE_GUARD_ABI, AGENT_DIRECTORY_ABI, OG_RPC } from "@/lib/contracts";
import { policyFromUint8 } from "@/lib/agents";

const ANVIL_RPC = process.env.ANVIL_RPC_URL || "http://127.0.0.1:8545";

/**
 * GET /api/guard/panel?guardAddress=0x...
 * Reads the agent panel and policy from InferenceGuard on Anvil,
 * then resolves agent names from AgentDirectory on 0G.
 */
export async function GET(req: NextRequest) {
  const guardAddress = req.nextUrl.searchParams.get("guardAddress");
  if (!guardAddress || !ethers.isAddress(guardAddress)) {
    return NextResponse.json({ error: "guardAddress query param required" }, { status: 400 });
  }

  try {
    const anvilProvider = new ethers.JsonRpcProvider(ANVIL_RPC);
    const guard = new ethers.Contract(guardAddress, INFERENCE_GUARD_ABI, anvilProvider);

    const [panelIds, policyRaw] = await Promise.all([
      guard.getPanel() as Promise<string[]>,
      guard.policy() as Promise<bigint>,
    ]);

    const policy = policyFromUint8(Number(policyRaw));

    // Resolve agent metadata from AgentDirectory on 0G
    const directoryAddress = process.env.NEXT_PUBLIC_DIRECTORY_ADDRESS;
    let panel: { id: string; name: string; description: string; capabilities: string[] }[] = [];

    if (directoryAddress && panelIds.length > 0) {
      const ogProvider = new ethers.JsonRpcProvider(OG_RPC);
      const directory = new ethers.Contract(directoryAddress, AGENT_DIRECTORY_ABI, ogProvider);

      panel = await Promise.all(
        panelIds.map(async (id: string) => {
          try {
            const agent = await directory.getAgent(id);
            return {
              id,
              name: agent.name,
              description: agent.description,
              capabilities: agent.capabilities
                ? agent.capabilities.split(",").map((c: string) => c.trim()).filter(Boolean)
                : [],
            };
          } catch {
            return { id, name: `Unknown (${id.slice(0, 10)}...)`, description: "", capabilities: [] };
          }
        })
      );
    } else {
      panel = panelIds.map((id: string) => ({
        id,
        name: `Agent ${id.slice(0, 10)}...`,
        description: "",
        capabilities: [],
      }));
    }

    return NextResponse.json({ panel, policy });
  } catch (e) {
    console.error("Failed to read guard panel:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to read panel" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/guard/panel
 * Returns encoded calldata for setPanel + setPolicy Safe transactions.
 * The frontend signs and executes these via Safe.execTransaction.
 */
export async function PUT(req: NextRequest) {
  try {
    const { guardAddress, agentIds, policy } = await req.json();

    if (!guardAddress || !ethers.isAddress(guardAddress)) {
      return NextResponse.json({ error: "guardAddress is required" }, { status: 400 });
    }

    const iface = new ethers.Interface(INFERENCE_GUARD_ABI);
    const calls: { to: string; data: string; description: string }[] = [];

    if (Array.isArray(agentIds)) {
      calls.push({
        to: guardAddress,
        data: iface.encodeFunctionData("setPanel", [agentIds]),
        description: `setPanel(${agentIds.length} agents)`,
      });
    }

    if (policy !== undefined && policy !== null) {
      const p = Number(policy);
      if (p < 0 || p > 2) {
        return NextResponse.json({ error: "policy must be 0, 1, or 2" }, { status: 400 });
      }
      calls.push({
        to: guardAddress,
        data: iface.encodeFunctionData("setPolicy", [p]),
        description: `setPolicy(${["Unanimous", "Majority", "AnyReject"][p]})`,
      });
    }

    if (calls.length === 0) {
      return NextResponse.json({ error: "Nothing to update — provide agentIds or policy" }, { status: 400 });
    }

    return NextResponse.json({ calls });
  } catch (e) {
    console.error("Failed to encode panel update:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to encode panel update" },
      { status: 500 }
    );
  }
}
