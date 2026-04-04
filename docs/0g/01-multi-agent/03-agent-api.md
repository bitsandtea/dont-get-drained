# 03 — Agent CRUD API Routes

**Status**: TODO  
**Depends on**: 01 (AgentDirectory contract deployed), 02 (contracts.ts updated)

## What

Create API routes to list, register, and update agents. Agent prompts are stored on 0G Storage. Registration writes metadata to AgentDirectory on 0G testnet.

## Files to Create

### `frontend/app/api/agents/route.ts`

**GET /api/agents** — List all agents from AgentDirectory

```typescript
// 1. Connect to AgentDirectory on 0G testnet
// 2. Call directory.getAllAgents()
// 3. Parse and return as JSON array of AgentConfig
// Uses: listAgents() from frontend/lib/agents.ts
```

**POST /api/agents** — Register a new agent

```typescript
// Body: { name, description, promptTemplate, pricePerInference, capabilities }
//
// Flow:
// 1. Validate inputs (name required, promptTemplate required, capabilities string)
// 2. Store promptTemplate on 0G Storage → get promptCid (rootHash)
//    Use: storeOn0G() from frontend/lib/og-inference.ts
// 3. Register on AgentDirectory contract on 0G testnet
//    Use: registerAgentOnChain() from frontend/lib/agents.ts
// 4. Return { agentId, promptCid, name, txHash }
```

### `frontend/app/api/agents/[id]/route.ts`

**GET /api/agents/[id]** — Get single agent details

```typescript
// 1. Read agent from directory: getAgent(id)
// 2. Optionally fetch prompt from 0G Storage using promptCid
// 3. Return agent details + prompt text
```

**PUT /api/agents/[id]** — Update agent prompt

```typescript
// Body: { promptTemplate }
//
// Flow:
// 1. Store new promptTemplate on 0G Storage → new promptCid
// 2. Call directory.updatePrompt(agentId, newPromptCid) on 0G testnet
// 3. Return { agentId, newPromptCid, txHash }
```

## Key Dependencies

- `frontend/lib/agents.ts` — already has `listAgents()`, `getAgent()`, `registerAgentOnChain()`, `updateAgentPromptOnChain()`
- `frontend/lib/og-inference.ts` — has `storeOn0G()` for storing prompts, needs `fetchFrom0G()` added
- `frontend/lib/contracts.ts` — needs `AGENT_DIRECTORY_ABI` (task 02)

## Adding `fetchFrom0G()` to og-inference.ts

This function is needed to retrieve stored prompt templates:

```typescript
// Add to frontend/lib/og-inference.ts
export async function fetchFrom0G(rootHash: string): Promise<string> {
  // Use 0G Storage SDK to download data by rootHash
  // The Indexer can retrieve data: GET /file?root={rootHash}
  // Parse bytes back to string
  // Cache in-memory for repeated fetches
}
```

## Agent Input Variables

Every agent prompt template can use these variables (see 00-reqs.md for full list):

`{{signer}}`, `{{recipient}}`, `{{safeAddress}}`, `{{txTarget}}`, `{{txData}}`, `{{txValue}}`, `{{amountIn}}`, `{{outputAmount}}`, `{{tokenSymbol}}`, `{{tokenOut}}`, `{{routing}}`, `{{gasFeeUSD}}`, `{{intent}}`, `{{simulationResults}}`, `{{USDC}}`, `{{DAI}}`, `{{WETH}}`

## Error Handling

- If 0G Storage upload fails: return 500 with clear message
- If directory registration fails: return 500 with revert reason
- If agent not found: return 404
- If not creator (for update): return 403
