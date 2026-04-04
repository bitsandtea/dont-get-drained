# Implementation Details

## What's Been Built

### Smart Contracts
- **`dapp/src/AgentDirectory.sol`** — Marketplace registry. Compiles. Ready to deploy on 0G testnet.
- **`dapp/script/DeployDirectory.s.sol`** — Deployment script for 0G testnet.

### Frontend Libraries  
- **`frontend/lib/agents.ts`** — Types (`AgentConfig`, `AgentVerdict`, `AggregationPolicy`), aggregation logic (`aggregateVerdicts`, `policyFromUint8`), contract helpers (`listAgents`, `getAgent`, `registerAgentOnChain`, `updateAgentPromptOnChain`).

### Cleanup
- Removed MyToken references from `ForkSafe.t.sol` and `ForkUniswap.t.sol`
- Full `forge build` passing

## What's Pending (by task)

See individual requirement files (03-09) in this directory. Each is self-contained.

## Key Implementation Notes

### Agent Prompt Storage
Agent prompts are stored as raw text on **0G Storage** using the existing `storeOn0G()` function in `frontend/lib/og-inference.ts`. The rootHash returned becomes the `promptCid` registered in the AgentDirectory contract.

### Cross-Chain Bridging
- AgentDirectory lives on 0G testnet
- InferenceGuard lives on Anvil (mainnet fork)
- The review API connects to both via separate RPC providers
- No on-chain cross-chain calls — the off-chain API layer bridges

### Aggregation is Off-Chain
The InferenceGuard contract stores `agentPanel[]` and `policy` as informational state. The actual multi-agent orchestration and aggregation happens in `/api/review`. The guard still receives a single `approveTransaction(txHash, rootHash, finalVerdict)` call.

### Backward Compatibility
If guard has empty panel → single-prompt mode using `prompt-store.ts` (current behavior). No breaking changes to existing flow.
