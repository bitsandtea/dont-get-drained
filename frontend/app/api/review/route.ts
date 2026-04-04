import { NextRequest, NextResponse } from "next/server";
import { computeGuardTxHash } from "@/lib/guard";
import { CONTRACTS, TOKENS, INFERENCE_GUARD_ABI, AGENT_DIRECTORY_ABI, OG_RPC } from "@/lib/contracts";
import { runInference, storeOn0G, fetchFrom0G } from "@/lib/og-inference";
import { getSwapQuote } from "@/lib/uniswap";
import { getPromptTemplate, renderPrompt } from "@/lib/prompt-store";
import { getAgent, AgentVerdict, aggregateVerdicts, policyFromUint8 } from "@/lib/agents";
import { ethers } from "ethers";

// Record inference usage for an agent on the AgentDirectory (fire-and-forget)
async function recordInference(agentId: string): Promise<void> {
  const key = process.env.OG_PRIVATE_KEY;
  const directoryAddr = process.env.NEXT_PUBLIC_DIRECTORY_ADDRESS;
  if (!key || !directoryAddr) return;

  try {
    const provider = new ethers.JsonRpcProvider(OG_RPC);
    const wallet = new ethers.Wallet(key, provider);
    const directory = new ethers.Contract(directoryAddr, AGENT_DIRECTORY_ABI, wallet);
    await directory.recordInference(agentId);
  } catch (e) {
    console.warn(`[REVIEW] Failed to record inference for ${agentId}:`, e instanceof Error ? e.message : e);
  }
}

// ETH native address for the Trading API
const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";

// Read panel + policy from InferenceGuard contract
async function readGuardPanel(guardAddress: string): Promise<{ panel: string[]; policy: number }> {
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const guard = new ethers.Contract(guardAddress, INFERENCE_GUARD_ABI, provider);
  const panel: string[] = await guard.getPanel();
  const policy: number = Number(await guard.policy());
  return { panel: [...panel], policy };
}

// Run a single agent's inference and return its verdict
async function runAgentInference(
  agentId: string,
  vars: Record<string, string>
): Promise<AgentVerdict> {
  // Fetch agent metadata from AgentDirectory on 0G testnet
  const agent = await getAgent(agentId);

  // Fetch prompt template from 0G Storage
  const raw = await fetchFrom0G(agent.promptCid);
  let template: string;
  try {
    const parsed = JSON.parse(raw);
    template = parsed.promptTemplate ?? raw;
  } catch {
    template = raw;
  }

  // Render the prompt with transaction variables
  const prompt = renderPrompt(template, vars);

  console.log(`[REVIEW] === AGENT ${agentId.slice(0, 10)}... PROMPT ===`);
  console.log(`[REVIEW] Agent name: ${agent.name}`);
  console.log(`[REVIEW] Prompt CID: ${agent.promptCid}`);
  console.log(`[REVIEW] Raw template (first 500 chars): ${template.slice(0, 500)}`);
  console.log(`[REVIEW] Rendered prompt:\n${prompt}`);
  console.log(`[REVIEW] === END AGENT PROMPT ===`);

  // Run inference on 0G Compute
  const inference = await runInference(prompt);

  // Parse JSON verdict from AI answer
  let verdict = false;
  let notes = inference.answer;
  try {
    const jsonMatch = inference.answer.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      verdict = parsed.approved === 1;
      notes = parsed.notes || inference.answer;
    }
  } catch {
    verdict = false;
    notes = `Failed to parse AI response: ${inference.answer}`;
  }

  return {
    agentId,
    name: agent.name,
    verdict,
    notes,
    teeProof: inference.teeProof,
    verified: inference.verified,
    chatId: inference.chatId,
  };
}

// POST /api/review
// Submit a swap transaction for AI review via 0G inference
// Body: { tokenOut, amountIn, recipient, signer, intent }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tokenOut, amountIn, recipient, signer, intent } = body;

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

    // Simulate asset changes via Alchemy
    let simulation = null;
    let simulationSummary = "Simulation not available";
    const alchemyUrl = process.env.ALCHEMY_RPC_URL;
    if (alchemyUrl && !alchemyUrl.includes("YOUR_ALCHEMY_KEY")) {
      try {
        const simValue = "0x" + BigInt(uniQuote.tx.value).toString(16);
        const simRes = await fetch(alchemyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: 1,
            jsonrpc: "2.0",
            method: "alchemy_simulateAssetChanges",
            params: [{
              from: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
              to: uniQuote.tx.to,
              value: simValue,
              data: uniQuote.tx.data,
            }],
          }),
        });
        const simData = await simRes.json();
        if (simData.result) {
          simulation = simData.result;
          const changes = simulation.changes || [];
          simulationSummary = changes.length > 0
            ? changes.map((c: { changeType: string; amount: string; symbol: string; from: string; to: string }) =>
                `${c.changeType}: ${c.amount} ${c.symbol} (from: ${c.from} → to: ${c.to})`
              ).join("\n  ")
            : "No asset changes detected";
        } else if (simData.error) {
          simulationSummary = "Simulation failed: " + (simData.error.message || "unknown error");
        }
      } catch (e) {
        simulationSummary = "Simulation unavailable";
        console.warn("[REVIEW] Alchemy simulation failed:", e instanceof Error ? e.message : e);
      }
    }

    // Build variable context for all agent prompts
    const tokenSymbol = tokenEntry?.symbol ?? tokenOut;
    const vars: Record<string, string> = {
      signer: signer || recipient,
      recipient,
      safeAddress: recipient,
      txTarget: uniQuote.tx.to,
      txData: uniQuote.tx.data,
      txValue: uniQuote.tx.value,
      amountIn: String(amountIn),
      outputAmount: uniQuote.outputAmount,
      tokenSymbol,
      tokenOut,
      routing: uniQuote.routing,
      gasFeeUSD: uniQuote.gasFeeUSD,
      intent: intent || "No intent provided",
      simulationResults: simulationSummary,
      USDC: CONTRACTS.USDC,
      DAI: CONTRACTS.DAI,
      WETH: CONTRACTS.WETH,
    };

    // --- Multi-agent or single-agent path ---

    let panel: string[] = [];
    let policyNum = 0;

    // Try to read panel from guard contract
    const guardAddress = CONTRACTS.INFERENCE_GUARD;
    if (guardAddress) {
      try {
        const guardState = await readGuardPanel(guardAddress);
        panel = guardState.panel;
        policyNum = guardState.policy;
      } catch (e) {
        console.warn("[REVIEW] Could not read guard panel:", e instanceof Error ? e.message : e);
      }
    }

    const policyName = policyFromUint8(policyNum);
    let agents: AgentVerdict[];

    if (panel.length > 0) {
      // Multi-agent: run all agents concurrently
      const results = await Promise.allSettled(
        panel.map((agentId) => runAgentInference(agentId, vars))
      );

      agents = results.map((result, i) => {
        if (result.status === "fulfilled") {
          return result.value;
        }
        // Failed agent → mark as failed, not as a genuine rejection
        return {
          agentId: panel[i],
          name: `Agent ${panel[i].slice(0, 10)}...`,
          verdict: false,
          notes: `Inference failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
          teeProof: null,
          verified: null,
          chatId: "",
          failed: true,
        };
      });
    } else {
      // Single-agent fallback: use default prompt template
      const prompt = renderPrompt(getPromptTemplate(), vars);

      console.log("[REVIEW] === PROMPT FOR INFERENCE ===");
      console.log(prompt);
      console.log("[REVIEW] === END PROMPT ===");

      const inference = await runInference(prompt);

      let verdict = true;
      let notes = inference.answer;
      try {
        const jsonMatch = inference.answer.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          verdict = parsed.approved === 1;
          notes = parsed.notes || inference.answer;
        }
      } catch {
        verdict = false;
        notes = `Failed to parse AI response: ${inference.answer}`;
      }

      agents = [{
        agentId: "default",
        name: "Default Guard",
        verdict,
        notes,
        teeProof: inference.teeProof,
        verified: inference.verified,
        chatId: inference.chatId,
      }];
    }

    // Record inference usage for successful agents (fire-and-forget, don't block response)
    const successfulAgents = agents.filter((a) => !a.failed && a.agentId !== "default");
    if (successfulAgents.length > 0) {
      Promise.allSettled(successfulAgents.map((a) => recordInference(a.agentId))).catch(() => {});
    }

    // Aggregate verdicts
    const finalVerdict = aggregateVerdicts(agents, policyName);

    // Store full result on 0G Storage
    const fullResult = {
      timestamp: new Date().toISOString(),
      guardTxHash,
      swapParams: { tokenOut, amountIn, recipient, signer, intent: intent || "", quote: uniQuote.outputAmount },
      uniswap: { routing: uniQuote.routing, gasFeeUSD: uniQuote.gasFeeUSD },
      simulation,
      agents: agents.map((a) => ({
        agentId: a.agentId,
        name: a.name,
        verdict: a.verdict,
        notes: a.notes,
        verified: a.verified,
        chatId: a.chatId,
        ...(a.failed ? { failed: true } : {}),
      })),
      policy: policyName,
      finalVerdict,
    };

    const storage = await storeOn0G(fullResult);

    return NextResponse.json({
      txHash: guardTxHash,
      swapTx: uniQuote.tx,
      finalVerdict,
      verdict: finalVerdict, // backward compat
      policy: policyName,
      agents,
      quote: uniQuote.outputAmount,
      gasFeeUSD: uniQuote.gasFeeUSD,
      routing: uniQuote.routing,
      aiAnswer: agents.map((a) => a.notes).join(" | "),
      teeProof: agents[0]?.teeProof ?? null,
      verified: agents[0]?.verified ?? null,
      rootHash: storage.rootHash,
      storageTxHash: storage.txHash,
      simulation,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
