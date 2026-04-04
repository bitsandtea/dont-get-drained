# Don't Get Drained -- Frontend

Next.js app providing the UI and API routes for the agentic firewall marketplace.

## Features

- Swap interface for configuring token swaps with plain-English intent
- Agent marketplace for browsing, publishing, and selecting guard agents
- Review dashboard showing AI agent verdicts, simulation results, and TEE proofs
- API routes orchestrating inference via 0G Compute, storage via 0G Storage, and simulation via Alchemy

## Tech Stack

- Next.js 16, React 19, TypeScript
- Tailwind CSS 4
- ethers.js 6
- 0G TS SDK, 0G Serving Broker

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm

### Install

```bash
pnpm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in:

- `OG_PRIVATE_KEY` -- Wallet key for 0G operations
- `OG_RPC_URL` -- 0G testnet RPC
- `NEXT_PUBLIC_DIRECTORY_ADDRESS` -- AgentDirectory contract address
- `NEXT_PUBLIC_GUARD_ADDRESS` -- InferenceGuard contract address
- `NEXT_PUBLIC_SAFE_ADDRESS` -- Safe wallet address
- `RPC_URL` -- Anvil RPC (localhost:8545)
- `RELAYER_PRIVATE_KEY` -- Relayer key for submitting approvals

### Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Key Directories

| Path | Description |
|------|-------------|
| `app/page.tsx` | Main swap interface |
| `app/api/review/` | Core review orchestration |
| `app/api/agents/` | Agent marketplace APIs |
| `app/api/rekt/` | Rekt.news exploit indexing |
| `app/api/og-storage/` | 0G Storage operations |
| `lib/` | Shared utilities (contracts, inference, Uniswap, prompts) |
