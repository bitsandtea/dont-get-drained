# Multi-Agent Marketplace — Requirements

## What We're Building

A marketplace where anyone can publish security agents (prompt templates stored on 0G Storage) and guard owners compose panels of agents to protect their Safe wallets. Each agent runs concurrently during transaction review and votes approve/reject.

## Architecture

- **AgentDirectory contract** → **0G testnet** (`https://evmrpc-testnet.0g.ai`)
- **InferenceGuard contract** → **Anvil** (mainnet fork, same chain as Safe)
- **Off-chain API** bridges both chains
- **Agent prompts** stored on **0G Storage**, referenced by rootHash (promptCid)

---

## Agent Input Framework

Every agent receives the same **context payload** — a structured set of data injected into its prompt template via `{{variables}}`. The agent's prompt defines *how* it interprets this data, but every agent gets the same inputs.

### Transaction Context (who + what)

| Variable | Description | Source |
|----------|-------------|--------|
| `{{signer}}` | Address that will sign the Safe transaction | Frontend (connected wallet) |
| `{{recipient}}` | Safe address that initiates & receives the swap | Frontend (Safe address) |
| `{{safeAddress}}` | The Safe contract address | Frontend (same as recipient for self-swaps) |
| `{{txTarget}}` | Target contract the Safe calls (e.g. Uniswap router) | Uniswap Trading API |
| `{{txData}}` | Raw transaction calldata (hex bytecode) | Uniswap Trading API |
| `{{txValue}}` | ETH value sent with the transaction (wei) | Uniswap Trading API |

### Swap Details (the trade)

| Variable | Description | Source |
|----------|-------------|--------|
| `{{amountIn}}` | Amount of ETH being swapped | User input |
| `{{outputAmount}}` | Expected token output amount | Uniswap quote |
| `{{tokenSymbol}}` | Output token symbol (USDC, DAI, etc.) | Token registry |
| `{{tokenOut}}` | Output token contract address | User selection |
| `{{routing}}` | Uniswap routing path (pools used) | Uniswap quote |
| `{{gasFeeUSD}}` | Estimated gas cost in USD | Uniswap quote |

### User Intent (why)

| Variable | Description | Source |
|----------|-------------|--------|
| `{{intent}}` | Plain-English statement of *why* this swap is being made | User input (required, min 10 chars) |

The intent is a critical signal. It lets agents evaluate whether the stated purpose matches the transaction parameters. A mismatch (e.g. intent says "small test" but amount is 100 ETH) is itself a flag. See `docs/08-intent.md` for full spec.

### Simulation Results (what happens)

| Variable | Description | Source |
|----------|-------------|--------|
| `{{simulationResults}}` | Alchemy `simulateAssetChanges` output — shows actual balance deltas | Alchemy RPC |

### Reference Data (known-good context)

| Variable | Description | Source |
|----------|-------------|--------|
| `{{USDC}}` | USDC contract address (known safe) | Hardcoded |
| `{{DAI}}` | DAI contract address (known safe) | Hardcoded |
| `{{WETH}}` | WETH contract address (known safe) | Hardcoded |

### Full Context Object (sent to `/api/review`)

```typescript
// POST /api/review body
{
  tokenOut: string;       // output token address
  amountIn: string;       // ETH amount
  recipient: string;      // Safe address
  signer: string;         // address signing the tx
  intent: string;         // user's stated reason for this swap
}
```

The review API enriches this with Uniswap quote, simulation, and reference data before injecting into each agent's prompt.

---

## Agent Definition

An agent is:

1. **A prompt template** stored on 0G Storage (text with `{{variable}}` placeholders)
2. **Metadata** registered on AgentDirectory contract (name, description, capabilities, price)
3. **A promptCid** linking the two (0G Storage rootHash)

The prompt template receives ALL variables above. Each agent's template decides which ones to use and how to reason about them.

### Verdict Format

Every agent must respond with ONLY valid JSON:
```json
{"approved": 1, "notes": "reason for approval"}
```
or
```json
{"approved": 0, "notes": "reason for rejection"}
```

---

## Task Breakdown

Each file below is self-contained for parallel implementation.

| File | Task | Deps | Status |
|------|------|------|--------|
| [01-agent-directory-contract.md](01-agent-directory-contract.md) | AgentDirectory.sol + deploy script | None | DONE |
| [02-contracts-lib.md](02-contracts-lib.md) | Update `contracts.ts` with new ABIs | 01 | TODO |
| [03-agent-api.md](03-agent-api.md) | `/api/agents` routes (list, register, update) | 01, 02 | TODO |
| [04-marketplace-ui.md](04-marketplace-ui.md) | Marketplace page to browse agents | 03 | TODO |
| [05-agent-create-ui.md](05-agent-create-ui.md) | Agent creation page with prompt editor + 0G storage | 03 | TODO |
| [06-inference-guard-contract.md](06-inference-guard-contract.md) | Rename AIGuard → InferenceGuard + panel/policy | None | TODO |
| [07-multi-agent-review.md](07-multi-agent-review.md) | Rewrite `/api/review` for concurrent multi-agent | 02, 03, 06 | TODO |
| [08-multi-verdict-ui.md](08-multi-verdict-ui.md) | Multi-verdict cards in review step | 07 | TODO |
| [09-panel-management.md](09-panel-management.md) | Panel config API + UI | 06, 03 | TODO |

## What's Already Built

- `dapp/src/AgentDirectory.sol` — contract, compiles
- `dapp/script/DeployDirectory.s.sol` — ready to deploy on 0G testnet
- `frontend/lib/agents.ts` — types, aggregation logic, contract read/write helpers
- `docs/0g/07-multi-agent.md` — architecture overview
- MyToken removed from tests, full `forge build` passing

## Key Constants

- **0G RPC**: `https://evmrpc-testnet.0g.ai`
- **0G Storage Indexer**: `https://indexer-storage-testnet-turbo.0g.ai`
- **Anvil RPC**: `http://127.0.0.1:8545`
- **Env vars needed**: `NEXT_PUBLIC_DIRECTORY_ADDRESS`, `OG_PRIVATE_KEY`, `OG_RPC_URL`

## Next.js Warning

Read `frontend/AGENTS.md` — this Next.js version may have breaking changes. Check `node_modules/next/dist/docs/` before writing frontend code.
