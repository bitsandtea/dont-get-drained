# 07 — Multi-Agent Review Flow

**Status**: TODO  
**Depends on**: 02 (contracts.ts), 03 (agent API), 06 (InferenceGuard with panel)

## What

Rewrite `/api/review` to run multiple agents concurrently. Read the guard's panel, fetch each agent's prompt from 0G, run all inferences in parallel, aggregate verdicts.

## File to Modify

`frontend/app/api/review/route.ts`

## New Flow

```
POST /api/review { tokenOut, amountIn, recipient, signer, intent }
  |
  |-- 1. Read guard.getPanel() from Anvil RPC → bytes32[] of agentIds
  |-- 2. Read guard.policy() from Anvil RPC → aggregation policy (0/1/2)
  |-- 3. If panel is empty → fall back to single-prompt behavior (backward compat)
  |
  |-- 4. Get Uniswap quote + executable tx (same as today)
  |-- 5. Run Alchemy simulation (same as today)
  |
  |-- 6. For each agentId (concurrently via Promise.allSettled):
  |     a. directory.getAgent(agentId) on 0G RPC → { name, promptCid }
  |     b. fetchFrom0G(promptCid) → prompt template text
  |     c. renderPrompt(template, allVariables) → filled prompt
  |     d. runInference(prompt) on 0G Compute → { answer, teeProof }
  |     e. Parse JSON verdict: { approved: 0|1, notes }
  |
  |-- 7. aggregateVerdicts(verdicts, policy) → finalVerdict
  |-- 8. storeOn0G({ verdicts, policy, finalVerdict, swapParams, simulation })
  |
  v
Return response
```

## Variables Passed to Each Agent

All variables from the context payload (see 00-reqs.md):

```typescript
const vars = {
  signer,
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
  intent,
  simulationResults: simulationSummary,
  USDC: CONTRACTS.USDC,
  DAI: CONTRACTS.DAI,
  WETH: CONTRACTS.WETH,
};
```

## New Response Shape

```typescript
{
  txHash: string;
  swapTx: { to, data, value, gasLimit };
  finalVerdict: boolean;
  policy: "unanimous" | "majority" | "anyReject";
  agents: Array<{
    agentId: string;
    name: string;
    verdict: boolean;
    notes: string;
    teeProof: { text, signature } | null;
    verified: boolean | null;
    chatId: string;
  }>;
  rootHash: string;        // aggregate 0G storage hash
  storageTxHash: string;
  // ...existing fields (quote, gasFeeUSD, routing, simulation)
}
```

## Backward Compatibility

If `guard.getPanel()` returns empty array → run single-prompt inference using `getPromptTemplate()` from `prompt-store.ts` (current behavior). Return same response shape but with `agents: [{ agentId: "default", ... }]`.

## Key Imports

- `aggregateVerdicts`, `policyFromUint8` from `frontend/lib/agents.ts`
- `INFERENCE_GUARD_ABI`, `AGENT_DIRECTORY_ABI` from `frontend/lib/contracts.ts`
- `fetchFrom0G` from `frontend/lib/og-inference.ts`
- `renderPrompt` from `frontend/lib/prompt-store.ts`

## Error Handling

- If any single agent inference fails: mark that agent's verdict as `{ verdict: false, notes: "inference failed: ..." }`
- Use `Promise.allSettled` not `Promise.all` so one failure doesn't kill the batch
- If ALL agents fail: return finalVerdict = false with error message
