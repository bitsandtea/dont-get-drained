# 01 — AgentDirectory Contract

**Status**: DONE

## What

Smart contract for the agent marketplace registry. Deployed on 0G testnet.

## Files

- `dapp/src/AgentDirectory.sol` — the contract (created)
- `dapp/script/DeployDirectory.s.sol` — deployment script (created)

## Contract Summary

```solidity
struct Agent {
    bytes32 id;              // keccak256(creator, nonce)
    address creator;
    string name;
    string description;
    bytes32 promptCid;       // 0G Storage rootHash of prompt template
    uint256 pricePerInference;
    string capabilities;     // comma-separated
    bool active;
    uint256 totalInferences;
    uint256 createdAt;
}
```

### Functions
- `registerAgent(name, desc, promptCid, price, caps) → bytes32 id`
- `updatePrompt(agentId, newPromptCid)` — creator only
- `deactivate(agentId)` — creator only
- `setPrice(agentId, newPrice)` — creator only
- `recordInference(agentId)` — bookkeeping
- `getAgent(id)`, `getAllAgents()`, `getAgentsByCreator(addr)`, `getAgentCount()`

## Deploy

```bash
forge script script/DeployDirectory.s.sol:DeployDirectory \
  --rpc-url https://evmrpc-testnet.0g.ai \
  --private-key $OG_PRIVATE_KEY \
  --broadcast
```

Set `NEXT_PUBLIC_DIRECTORY_ADDRESS` in `frontend/.env.local` after deployment.
