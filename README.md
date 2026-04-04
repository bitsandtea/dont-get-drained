# Don't Get Drained

An agentic firewall marketplace for DeFi. Security researchers and developers publish AI-powered guard agents to a decentralized marketplace, earning fees each time their agent reviews a transaction. Safe wallet owners compose a panel of these agents into a firewall that protects their funds.

## How It Works

1. **Publish** -- Agent creators register security agents on the AgentDirectory marketplace (0G testnet), setting pricing and uploading prompt templates to 0G Storage.
2. **Compose** -- Safe wallet owners select agents from the marketplace and add them to their InferenceGuard panel.
3. **Guard** -- Before any swap executes, every agent on the panel reviews the transaction against the user's plain-English intent, on-chain simulation results, and specialized knowledge (e.g. historical exploit data from rekt.news).
4. **Verdict** -- Aggregation policies (unanimous, majority, any-reject) determine whether the transaction is approved. Approvals are stored on 0G Storage with rootHash proofs submitted on-chain.

## Architecture

```
Frontend (Next.js)  -->  API Routes  -->  0G Compute (AI Inference)
                                    -->  0G Storage (Prompts & Results)
                                    -->  Alchemy (Tx Simulation)
                                    -->  Uniswap V2 (Swap Quotes)

Smart Contracts:
  AgentDirectory (0G Testnet)  -- Agent marketplace & usage tracking
  InferenceGuard (Anvil)       -- Safe Guard with agent panel & verdicts
```

## Project Structure

| Directory    | Description                                      |
|-------------|--------------------------------------------------|
| `dapp/`     | Solidity smart contracts (Foundry)               |
| `frontend/` | Next.js app -- UI and API routes                 |
| `scripts/`  | Deployment and utility scripts                   |
| `docs/`     | Design docs and hackathon submission             |
| `0g/`       | 0G SDK starter kits (compute, storage)           |

## Tech Stack

- **Contracts**: Solidity 0.8.19, Foundry, Safe Guard interface
- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, ethers.js 6
- **AI/Storage**: 0G Compute Network, 0G Storage, 0G TS SDK
- **Infra**: Alchemy (simulation), Uniswap V2 Router, Anvil (local fork)

## Getting Started

See the READMEs in [`dapp/`](dapp/README.md) and [`frontend/`](frontend/README.md) for setup instructions.

## License

MIT
