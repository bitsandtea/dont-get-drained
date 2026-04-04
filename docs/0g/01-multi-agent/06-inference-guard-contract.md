# 06 — Rename AIGuard → InferenceGuard + Panel/Policy

**Status**: TODO  
**Depends on**: None (independent of AgentDirectory work)

## What

Rename `AIGuard.sol` to `InferenceGuard.sol` and add panel management (which agents to consult) and aggregation policy (how to combine verdicts).

## Files to Modify/Create

### `dapp/src/AIGuard.sol` → `dapp/src/InferenceGuard.sol`

1. Rename contract `AIGuard` → `InferenceGuard`
2. Add state:

```solidity
bytes32[] public agentPanel;     // agent IDs from AgentDirectory
uint8 public policy;             // 0=Unanimous, 1=Majority, 2=AnyReject
address public agentDirectory;   // AgentDirectory address on 0G (informational)
```

3. Add functions (Safe-only, enforced by `msg.sender == safe`):

```solidity
function setPanel(bytes32[] calldata agentIds) external {
    require(msg.sender == safe, "Only Safe");
    agentPanel = agentIds;
    emit PanelUpdated(agentIds);
}

function setPolicy(uint8 _policy) external {
    require(msg.sender == safe, "Only Safe");
    require(_policy <= 2, "Invalid policy");
    policy = _policy;
    emit PolicyUpdated(_policy);
}

function setAgentDirectory(address _dir) external {
    require(msg.sender == safe, "Only Safe");
    agentDirectory = _dir;
}

function getPanel() external view returns (bytes32[] memory) {
    return agentPanel;
}
```

4. Add events:
```solidity
event PanelUpdated(bytes32[] agentIds);
event PolicyUpdated(uint8 policy);
```

5. All existing approval logic unchanged

### `dapp/script/DeployGuard.s.sol`

- Change import from `AIGuard` to `InferenceGuard`
- Update deployment: `new InferenceGuard(_safe, _relayer)`

### `dapp/test/ForkAIGuard.t.sol`

- Rename to reference `InferenceGuard`
- Add tests for `setPanel`, `setPolicy`, `getPanel`
- Verify only Safe can call panel/policy setters

### `frontend/lib/contracts.ts`

- Rename `AI_GUARD_ABI` → `INFERENCE_GUARD_ABI`
- Add ABI entries for new functions:
  ```
  "function getPanel() external view returns (bytes32[])"
  "function setPanel(bytes32[]) external"
  "function policy() external view returns (uint8)"
  "function setPolicy(uint8) external"
  "function agentDirectory() external view returns (address)"
  ```
- Rename `CONTRACTS.AI_GUARD` → `CONTRACTS.INFERENCE_GUARD`

### All frontend files referencing AIGuard

Update variable names in:
- `frontend/app/api/approve/route.ts`
- `frontend/app/api/status/route.ts`
- `frontend/app/page.tsx`
- `frontend/app/guard/page.tsx`

## Note

The panel/policy are **informational** from the contract's perspective. They tell the off-chain review system which agents to run and how to aggregate. The guard's actual gatekeeping remains: check `approvals[txHash].approved == true`.
