# Multi-Agent Security Marketplace

## Overview

Evolve the single-guard-single-prompt system into a **multi-agent marketplace** where guard owners compose security panels from specialized agents. Each agent is a prompt template stored on 0G Storage, registered on-chain via an AgentDirectory contract on 0G testnet.

## Architecture

```
0G Testnet                          Anvil (Mainnet Fork)
+-------------------+               +--------------------+
| AgentDirectory    |               | InferenceGuard     |
| - registerAgent() |               | - agentPanel[]     |
| - getAgent()      |               | - policy           |
| - getAllAgents()   |               | - approveTransaction() |
+-------------------+               +--------------------+
        |                                    |
        |  off-chain API bridges both chains |
        +----------+   +--------------------+
                   |   |
              +----v---v----+
              | /api/review |
              |  1. Read panel from guard (Anvil)
              |  2. Read agents from directory (0G)
              |  3. Fetch prompts from 0G Storage
              |  4. Run N inferences concurrently (0G Compute)
              |  5. Aggregate verdicts
              |  6. Store bundle on 0G Storage
              |  7. Submit approval to guard (Anvil)
              +-------------+
```

## AgentDirectory Contract (0G Testnet)

Deployed on `https://evmrpc-testnet.0g.ai`.

```solidity
struct Agent {
    bytes32 id;              // keccak256(creator, nonce)
    address creator;
    string name;             // "RektNewsChecker"
    string description;
    bytes32 promptCid;       // 0G Storage rootHash of prompt template
    uint256 pricePerInference; // wei (0 = free, all free for hackathon)
    string capabilities;     // comma-separated: "exploit-detection,simulation"
    bool active;
    uint256 totalInferences;
    uint256 createdAt;
}
```

### Functions

| Function | Access | Description |
|----------|--------|-------------|
| `registerAgent(name, desc, promptCid, price, caps)` | Anyone | Publish a new agent |
| `updatePrompt(agentId, newPromptCid)` | Creator only | Update prompt template |
| `deactivate(agentId)` | Creator only | Remove from marketplace |
| `setPrice(agentId, price)` | Creator only | Change pricing |
| `getAgent(id)` | View | Get single agent |
| `getAllAgents()` | View | Browse marketplace |
| `getAgentsByCreator(addr)` | View | Filter by creator |
| `recordInference(agentId)` | Relayer | Increment usage counter |

## Agent Creation Flow (uses 0G Storage)

When a user creates a new agent via `/api/agents`:

```
User writes prompt template in UI
       |
       v
POST /api/agents { name, description, promptTemplate, capabilities }
       |
       v
1. storeOn0G(promptTemplate) --> promptCid (0G Storage rootHash)
2. directory.registerAgent(name, desc, promptCid, 0, caps) [0G testnet tx]
3. Return { agentId, promptCid, name, ... }
```

The prompt template is stored **entirely on 0G Storage** as a merkle-tree blob. The `promptCid` (rootHash) is then registered on-chain in the AgentDirectory. To update a prompt, a new version is stored on 0G and `updatePrompt(agentId, newCid)` is called.

## InferenceGuard Contract (Anvil)

Extended from AIGuard with panel management:

```solidity
bytes32[] public agentPanel;     // agent IDs from AgentDirectory
uint8 public policy;             // 0=Unanimous, 1=Majority, 2=AnyReject
address public agentDirectory;   // informational reference

function setPanel(bytes32[] calldata agentIds) external;  // Safe only
function setPolicy(uint8 _policy) external;               // Safe only
function getPanel() external view returns (bytes32[] memory);
```

The guard's actual gatekeeping is unchanged: `approvals[txHash].approved == true`. The panel/policy are informational for the off-chain review system.

## Multi-Agent Review Flow

```
User submits swap
       |
       v
/api/review
  |-- guard.getPanel() [Anvil RPC]  --> [agentId1, agentId2, agentId3]
  |-- guard.policy()   [Anvil RPC]  --> "majority"
  |-- getSwapQuote()                --> uniswap quote + executable tx
  |-- simulateAssetChanges()        --> alchemy simulation
  |
  |-- For each agentId (concurrent):
  |     |-- directory.getAgent(id) [0G RPC]  --> { name, promptCid }
  |     |-- fetchFrom0G(promptCid)           --> prompt template text
  |     |-- renderPrompt(template, vars)     --> filled prompt
  |     |-- runInference(prompt) [0G Compute] --> { answer, teeProof }
  |     |-- parse JSON verdict
  |
  |-- aggregateVerdicts(verdicts, policy)
  |-- storeOn0G({ verdicts, policy, finalVerdict, ... }) --> bundleRootHash
  |
  v
Return { finalVerdict, agents: [...], rootHash, swapTx, ... }
       |
       v
/api/approve --> guard.approveTransaction(txHash, bundleRootHash, finalVerdict)
       |
       v
Safe.execTransaction() --> guard.checkTransaction() verifies approval
```

## Aggregation Policies

| Policy | Rule | Use Case |
|--------|------|----------|
| Unanimous | All agents must approve | High-security vaults |
| Majority | >50% must approve | Balanced |
| AnyReject | Any single rejection blocks | Conservative |

## Starter Agents

### RektNewsChecker
- **Capabilities**: exploit-detection, pattern-matching
- **Prompt focus**: DeFi exploit patterns (reentrancy, flash loans, sandwich attacks)

### SimulationAnalyst
- **Capabilities**: simulation-analysis, balance-verification
- **Prompt focus**: Verify simulated asset changes match expected swap behavior

### AddressSafetyAuditor
- **Capabilities**: address-screening, scam-detection
- **Prompt focus**: Validate all addresses against known legitimate tokens/contracts

## 402x Payment Model (Future)

Each agent has `pricePerInference`. When the review API encounters a paid agent:

```
Client                              Review API
  |-- POST /api/review ------------>|
  |<-- 402 Payment Required --------|
  |    { agents: [{ id, price }],   |
  |      totalCost, payTo }         |
  |                                 |
  |-- Pay on-chain to directory --->|
  |                                 |
  |-- POST /api/review ------------>|
  |    X-Payment-Receipt: 0x...     |
  |<-- 200 { verdicts, ... } -------|
```

For hackathon: all agents are free. 402 flow documented but not enforced.

## Build Phases

### Phase 1: AgentDirectory on 0G + Agent CRUD
- Deploy AgentDirectory on 0G testnet
- API routes for listing + registering agents (prompt stored on 0G Storage)
- Marketplace UI to browse agents
- Agent creation UI with prompt editor

### Phase 2: InferenceGuard + Panel System
- Rename AIGuard -> InferenceGuard, add panel/policy state
- Panel management API + UI

### Phase 3: Multi-Agent Review
- Concurrent inference across N agents
- Verdict aggregation + multi-verdict UI

### Phase 4: Polish + 402x Documentation
- 402x spec documentation
- UI polish, demo prep

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/agents` | GET | List all agents from directory |
| `/api/agents` | POST | Register new agent (stores prompt on 0G) |
| `/api/agents/[id]` | GET | Get agent details + prompt |
| `/api/agents/[id]` | PUT | Update agent prompt (new 0G upload) |
| `/api/guard/panel` | GET | Read guard's panel + policy |
| `/api/guard/panel` | PUT | Update panel (via Safe tx) |
| `/api/review` | POST | Multi-agent concurrent review |
| `/api/approve` | POST | Submit verdict to guard |

## Frontend Pages

| Page | Purpose |
|------|---------|
| `/marketplace` | Browse + filter agents, add to panel |
| `/agents/create` | Publish new agent with prompt editor |
| `/` (main) | Swap wizard with multi-verdict display |
