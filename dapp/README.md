# Don't Get Drained -- Smart Contracts

Solidity smart contracts for the agentic firewall marketplace, built with Foundry.

## Contracts

### AgentDirectory

Decentralized marketplace for AI security agents on 0G testnet.

- Register agents with metadata, capabilities, and pricing
- Upload and update prompt templates (stored as CIDs on 0G Storage)
- Track inference usage per agent
- Agent creators earn fees per review

### InferenceGuard

Safe Guard implementation that enforces AI-reviewed transaction approvals.

- Implements the Safe `IGuard` interface
- Maintains an agent panel (list of agent IDs from AgentDirectory)
- Stores approval verdicts linked to transaction hashes
- Supports aggregation policies: Unanimous, Majority, AnyReject
- One-time use of rootHash proofs prevents replay

## Setup

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)

### Build

```shell
forge build
```

### Test

```shell
forge test
```

### Deploy

```shell
# Deploy to 0G testnet
forge script script/Deploy.s.sol --rpc-url $OG_RPC_URL --private-key $OG_PRIVATE_KEY --broadcast

# Or use the deploy script
./scripts/deploy.sh
```

### Local Development

Start a local Anvil node (mainnet fork):

```shell
anvil --fork-url $RPC_URL
```
