import { NextRequest, NextResponse } from "next/server";
import { computeGuardTxHash } from "@/lib/guard";
import { CONTRACTS, TOKENS, INFERENCE_GUARD_ABI, AGENT_DIRECTORY_ABI, OG_RPC } from "@/lib/contracts";
import { runInference, storeOn0G, fetchFrom0G } from "@/lib/og-inference";
import { getSwapQuote, checkApproval, ETH_ADDRESS } from "@/lib/uniswap";
import { getPromptTemplate, renderPrompt } from "@/lib/prompt-store";
import { getAgent, AgentVerdict, aggregateVerdicts, policyFromUint8, isStepFlow } from "@/lib/agents";
import { executeStepFlow } from "@/lib/step-executor";
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
// Supports both single-prompt agents and multi-step flows
async function runAgentInference(
  agentId: string,
  vars: Record<string, string>
): Promise<AgentVerdict> {
  // Fetch agent metadata from AgentDirectory on 0G testnet
  const agent = await getAgent(agentId);

  // Fetch prompt data from 0G Storage
  const raw = await fetchFrom0G(agent.promptCid);
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }

  const agentT0 = Date.now();
  console.log(`[REVIEW] ============================================`);
  console.log(`[REVIEW] === AGENT ${agentId} ===`);
  console.log(`[REVIEW] Agent name: ${agent.name}`);
  console.log(`[REVIEW] Prompt CID: ${agent.promptCid}`);
  console.log(`[REVIEW] Raw prompt data type: ${parsed ? typeof parsed : "null"}`);
  console.log(`[REVIEW] Raw prompt data (first 500): ${raw.slice(0, 500)}`);

  let finalAnswer: string;
  let teeProof: { text: string; signature: string } | null = null;
  let verified: boolean | null = null;
  let chatId = "";

  if (isStepFlow(parsed)) {
    // Multi-step flow: execute all steps sequentially
    console.log(`[REVIEW] MULTI-STEP flow detected`);
    console.log(`[REVIEW]   Steps: ${parsed.steps.length}`);
    parsed.steps.forEach((s: any, idx: number) => {
      console.log(`[REVIEW]   Step ${idx}: type=${s.type}, outputVar=${s.outputVar}${s.type === "curl" ? `, url=${s.url?.slice(0, 100)}` : ""}`);
    });
    console.log(`[REVIEW]   Data sources: ${parsed.dataSources.join(", ")}`);
    console.log(`[REVIEW]   Input vars provided: ${Object.keys(vars).join(", ")}`);

    const result = await executeStepFlow(parsed, vars);
    finalAnswer = result.finalOutput;

    console.log(`[REVIEW] Multi-step flow complete — ${result.inferences.length} inference(s), final output: ${finalAnswer.length} chars`);
    console.log(`[REVIEW] Final output: ${finalAnswer.slice(0, 1000)}${finalAnswer.length > 1000 ? "... [truncated]" : ""}`);

    // Use the last inference result for TEE proof
    if (result.inferences.length > 0) {
      const last = result.inferences[result.inferences.length - 1];
      teeProof = last.teeProof;
      verified = last.verified;
      chatId = last.chatId;
    }
  } else {
    // Single-shot prompt (backward compatible)
    console.log(`[REVIEW] SINGLE-SHOT prompt detected`);
    const template: string = parsed?.promptTemplate ?? raw;
    const prompt = renderPrompt(template, vars);

    console.log(`[REVIEW] Rendered prompt (${prompt.length} chars):`);
    console.log(`[REVIEW] --- PROMPT START ---`);
    console.log(prompt.slice(0, 2000) + (prompt.length > 2000 ? `\n... [truncated, ${prompt.length} total chars]` : ""));
    console.log(`[REVIEW] --- PROMPT END ---`);

    const inference = await runInference(prompt);
    finalAnswer = inference.answer;
    teeProof = inference.teeProof;
    verified = inference.verified;
    chatId = inference.chatId;

    console.log(`[REVIEW] Single-shot answer (${finalAnswer.length} chars): ${finalAnswer.slice(0, 1000)}${finalAnswer.length > 1000 ? "... [truncated]" : ""}`);
  }

  console.log(`[REVIEW] Agent ${agentId.slice(0, 10)}... completed in ${Date.now() - agentT0}ms`);
  console.log(`[REVIEW] TEE verified: ${verified}, has proof: ${!!teeProof}, chatId: ${chatId}`);
  console.log(`[REVIEW] === END AGENT ${agentId} ===`);
  console.log(`[REVIEW] ============================================`);

  // Parse JSON verdict from AI answer
  let verdict = false;
  let notes = finalAnswer;
  try {
    const jsonMatch = finalAnswer.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const p = JSON.parse(jsonMatch[0]);
      verdict = p.approved === 1 || p.approved === true || p.approve === 1 || p.approve === true;
      notes = p.notes || p.note || finalAnswer;
    }
  } catch {
    verdict = false;
    notes = `Failed to parse AI response: ${finalAnswer}`;
  }

  return { agentId, name: agent.name, verdict, notes, teeProof, verified, chatId };
}

// POST /api/review
// Submit a swap transaction for AI review via 0G inference
// Streams SSE progress events, then sends the final result as the last event
// Body: { tokenOut, amountIn, recipient, signer, intent }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tokenIn: rawTokenIn, tokenOut, amountIn, recipient, signer, intent } = body;
  const tokenIn = rawTokenIn || ETH_ADDRESS;

  if (!tokenOut || !amountIn || !recipient) {
    return NextResponse.json({ error: "Missing tokenOut, amountIn, or recipient" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        // --- Step 1: Get Uniswap quote ---
        send("step", { id: "quote", label: "Fetching swap quote from Uniswap", status: "running" });
        const tokenOutEntry = Object.values(TOKENS).find(
          (t) => t.address.toLowerCase() === tokenOut.toLowerCase()
        );
        const tokenInEntry = Object.values(TOKENS).find(
          (t) => t.address.toLowerCase() === tokenIn.toLowerCase()
        );
        const tokenOutDecimals = tokenOutEntry?.decimals ?? 18;
        const tokenInDecimals = tokenInEntry?.decimals ?? 18;
        const isEthIn = tokenIn === ETH_ADDRESS;

        const amountInWei = isEthIn
          ? ethers.parseEther(amountIn.toString()).toString()
          : ethers.parseUnits(amountIn.toString(), tokenInDecimals).toString();

        const uniQuote = await getSwapQuote({
          tokenIn,
          tokenOut,
          amountInWei,
          swapper: recipient,
          tokenOutDecimals,
          tokenInDecimals,
        });
        send("step", { id: "quote", label: "Fetching swap quote from Uniswap", status: "done", detail: `${uniQuote.outputAmount} ${tokenOutEntry?.symbol ?? "tokens"}` });

        // --- Step 1b: Check approval (token-to-token only) ---
        let approvalCheck = null;
        if (!isEthIn) {
          send("step", { id: "approval", label: "Checking token approval", status: "running" });
          try {
            approvalCheck = await checkApproval({
              tokenIn,
              amount: amountInWei,
              walletAddress: recipient,
            });
            send("step", { id: "approval", label: "Checking token approval", status: "done", detail: approvalCheck.isRequired ? "Approval needed" : "Already approved" });
          } catch (e) {
            send("step", { id: "approval", label: "Checking token approval", status: "error", detail: e instanceof Error ? e.message : "Failed" });
          }
        }

        // --- Step 2: Compute guard tx hash ---
        const guardTxHash = computeGuardTxHash({
          to: uniQuote.tx.to,
          value: BigInt(uniQuote.tx.value),
          data: uniQuote.tx.data,
        });

        // --- Step 3: Simulate via Alchemy ---
        send("step", { id: "simulate", label: "Simulating transaction", status: "running" });
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
                  from: CONTRACTS.WETH,
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
        send("step", { id: "simulate", label: "Simulating transaction", status: "done", detail: simulation ? `${(simulation.changes || []).length} asset change(s)` : "Skipped" });

        // Build variable context for all agent prompts
        const tokenOutSymbol = tokenOutEntry?.symbol ?? tokenOut;
        const tokenInSymbol = isEthIn ? "ETH" : (tokenInEntry?.symbol ?? tokenIn);
        const vars: Record<string, string> = {
          signer: signer || recipient,
          recipient,
          safeAddress: recipient,
          txTarget: uniQuote.tx.to,
          txData: uniQuote.tx.data,
          txValue: uniQuote.tx.value,
          amountIn: String(amountIn),
          outputAmount: uniQuote.outputAmount,
          tokenInSymbol,
          tokenSymbol: tokenOutSymbol,
          tokenIn,
          tokenOut,
          routing: uniQuote.routing,
          gasFeeUSD: uniQuote.gasFeeUSD,
          priceImpact: uniQuote.priceImpact,
          intent: intent || "No intent provided",
          simulationResults: simulationSummary,
          approvalRequired: approvalCheck ? String(approvalCheck.isRequired) : "N/A (ETH input)",
          USDC: CONTRACTS.USDC,
          DAI: CONTRACTS.DAI,
          WETH: CONTRACTS.WETH,
        };

        // --- Step 4: Read guard panel ---
        send("step", { id: "panel", label: "Reading guard panel from contract", status: "running" });
        let panel: string[] = [];
        let policyNum = 0;
        const guardAddress = CONTRACTS.INFERENCE_GUARD;

        console.log(`[REVIEW] ================================================`);
        console.log(`[REVIEW] REVIEW REQUEST`);
        console.log(`[REVIEW] Guard address: ${guardAddress}`);
        console.log(`[REVIEW] Swap: ${amountIn} ${tokenInSymbol} → ${tokenOut} for ${recipient}`);
        console.log(`[REVIEW] Guard tx hash: ${guardTxHash}`);
        console.log(`[REVIEW] Quote: ${uniQuote.outputAmount}, Gas: ${uniQuote.gasFeeUSD}`);
        console.log(`[REVIEW] Simulation: ${simulationSummary.slice(0, 300)}`);
        console.log(`[REVIEW] Vars: ${Object.entries(vars).map(([k, v]) => `${k}=${String(v).slice(0, 60)}`).join(", ")}`);
        console.log(`[REVIEW] ================================================`);

        if (guardAddress) {
          try {
            console.log(`[REVIEW] Reading guard panel from contract...`);
            const guardState = await readGuardPanel(guardAddress);
            panel = guardState.panel;
            policyNum = guardState.policy;
            console.log(`[REVIEW] Panel: ${panel.length} agent(s): ${panel.join(", ")}`);
            console.log(`[REVIEW] Policy: ${policyNum} (${policyFromUint8(policyNum)})`);
          } catch (e) {
            console.warn("[REVIEW] Could not read guard panel:", e instanceof Error ? e.message : e);
          }
        }
        send("step", { id: "panel", label: "Reading guard panel from contract", status: "done", detail: `${panel.length} agent(s), policy: ${policyFromUint8(policyNum)}` });

        const policyName = policyFromUint8(policyNum);
        let agents: AgentVerdict[];

        // --- Step 5: Run agent inferences ---
        if (panel.length > 0) {
          // Multi-agent: run all agents concurrently
          // Send initial running status for each agent
          panel.forEach((agentId, i) => {
            send("step", { id: `agent-${i}`, label: `Agent ${i + 1}: Running inference`, status: "running", detail: `${agentId.slice(0, 10)}...` });
          });

          console.log(`[REVIEW] Running ${panel.length} agent(s) concurrently...`);
          const tAgents = Date.now();

          // Wrap each agent so we can stream completion per-agent
          const results = await Promise.allSettled(
            panel.map(async (agentId, i) => {
              const result = await runAgentInference(agentId, vars);
              send("step", { id: `agent-${i}`, label: `Agent ${i + 1}: ${result.name}`, status: "done", detail: result.verdict ? "Approved" : "Rejected" });
              return result;
            })
          );
          console.log(`[REVIEW] All agents completed in ${Date.now() - tAgents}ms`);

          agents = results.map((result, i) => {
            if (result.status === "fulfilled") {
              return result.value;
            }
            send("step", { id: `agent-${i}`, label: `Agent ${i + 1}: Failed`, status: "error", detail: result.reason instanceof Error ? result.reason.message : "Unknown error" });
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
          send("step", { id: "agent-0", label: "Default Guard: Running inference", status: "running" });

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
              verdict = parsed.approved === 1 || parsed.approved === true || parsed.approve === 1 || parsed.approve === true;
              notes = parsed.notes || parsed.note || inference.answer;
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
          send("step", { id: "agent-0", label: `Default Guard: Inference`, status: "done", detail: verdict ? "Approved" : "Rejected" });
        }

        // Record inference usage for successful agents (fire-and-forget)
        const successfulAgents = agents.filter((a) => !a.failed && a.agentId !== "default");
        if (successfulAgents.length > 0) {
          console.log(`[REVIEW] Recording inference for ${successfulAgents.length} agent(s)...`);
          Promise.allSettled(successfulAgents.map((a) => recordInference(a.agentId))).catch(() => {});
        }

        // Aggregate verdicts
        console.log(`[REVIEW] ------------------------------------------------`);
        console.log(`[REVIEW] VERDICT AGGREGATION`);
        console.log(`[REVIEW] Policy: ${policyName}`);
        agents.forEach((a) => {
          console.log(`[REVIEW]   Agent "${a.name}" (${a.agentId.slice(0, 10)}...): verdict=${a.verdict}${a.failed ? " [FAILED]" : ""}, notes=${String(a.notes).slice(0, 200)}`);
        });
        const finalVerdict = aggregateVerdicts(agents, policyName);
        console.log(`[REVIEW] FINAL VERDICT: ${finalVerdict}`);
        console.log(`[REVIEW] ------------------------------------------------`);

        // --- Step 6: Store on 0G ---
        send("step", { id: "storage", label: "Storing verdict on 0G Storage", status: "running" });
        console.log(`[REVIEW] Storing result on 0G Storage...`);
        const fullResult = {
          timestamp: new Date().toISOString(),
          guardTxHash,
          swapParams: { tokenIn, tokenOut, amountIn, recipient, signer, intent: intent || "", quote: uniQuote.outputAmount },
          uniswap: { routing: uniQuote.routing, gasFeeUSD: uniQuote.gasFeeUSD, priceImpact: uniQuote.priceImpact },
          approval: approvalCheck,
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
        console.log(`[REVIEW] Stored on 0G — rootHash: ${storage.rootHash}, txHash: ${storage.txHash}, submissionIndex: ${storage.submissionIndex}`);
        console.log(`[REVIEW] ================================================`);
        console.log(`[REVIEW] REVIEW COMPLETE — verdict=${finalVerdict}, rootHash=${storage.rootHash.slice(0, 20)}...`);
        console.log(`[REVIEW] ================================================`);
        send("step", { id: "storage", label: "Storing verdict on 0G Storage", status: "done", detail: `Root: ${storage.rootHash.slice(0, 12)}...` });

        // Send final result
        send("result", {
          txHash: guardTxHash,
          swapTx: uniQuote.tx,
          finalVerdict,
          verdict: finalVerdict,
          policy: policyName,
          agents,
          quote: uniQuote.outputAmount,
          gasFeeUSD: uniQuote.gasFeeUSD,
          routing: uniQuote.routing,
          priceImpact: uniQuote.priceImpact,
          tokenIn,
          tokenInSymbol,
          tokenOutSymbol,
          approval: approvalCheck,
          aiAnswer: agents.map((a) => a.notes).join(" | "),
          teeProof: agents[0]?.teeProof ?? null,
          verified: agents[0]?.verified ?? null,
          rootHash: storage.rootHash,
          storageTxHash: storage.txHash,
          submissionIndex: storage.submissionIndex,
          simulation,
        });

        controller.close();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        send("error", { error: message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
