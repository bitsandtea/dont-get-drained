# 02 — Update contracts.ts with New ABIs

**Status**: TODO  
**Depends on**: 01 (AgentDirectory contract)

## What

Update `frontend/lib/contracts.ts` to add AgentDirectory ABI and prepare for InferenceGuard rename.

## File to Modify

`frontend/lib/contracts.ts`

## Changes

### 1. Add AGENT_DIRECTORY_ABI

```typescript
export const AGENT_DIRECTORY_ABI = [
  "function registerAgent(string name, string description, bytes32 promptCid, uint256 pricePerInference, string capabilities) external returns (bytes32)",
  "function updatePrompt(bytes32 agentId, bytes32 newPromptCid) external",
  "function deactivate(bytes32 agentId) external",
  "function setPrice(bytes32 agentId, uint256 newPrice) external",
  "function recordInference(bytes32 agentId) external",
  "function getAgent(bytes32 id) external view returns (tuple(bytes32 id, address creator, string name, string description, bytes32 promptCid, uint256 pricePerInference, string capabilities, bool active, uint256 totalInferences, uint256 createdAt))",
  "function getAllAgents() external view returns (tuple(bytes32 id, address creator, string name, string description, bytes32 promptCid, uint256 pricePerInference, string capabilities, bool active, uint256 totalInferences, uint256 createdAt)[])",
  "function getAgentsByCreator(address creator) external view returns (tuple(bytes32 id, address creator, string name, string description, bytes32 promptCid, uint256 pricePerInference, string capabilities, bool active, uint256 totalInferences, uint256 createdAt)[])",
  "function getAgentCount() external view returns (uint256)",
  "event AgentRegistered(bytes32 indexed id, address indexed creator, string name, bytes32 promptCid)",
  "event AgentUpdated(bytes32 indexed id, bytes32 newPromptCid)",
];
```

### 2. Add to CONTRACTS object

```typescript
AGENT_DIRECTORY: process.env.NEXT_PUBLIC_DIRECTORY_ADDRESS || "",
```

### 3. Add OG_RPC constant

```typescript
export const OG_RPC = process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai";
```

## Notes

- Keep existing `AI_GUARD_ABI` for now (will be renamed in task 06)
- The `AGENT_DIRECTORY_ABI` uses ethers v6 human-readable format matching the existing ABI style
- `frontend/lib/agents.ts` already imports `AGENT_DIRECTORY_ABI` from this file
