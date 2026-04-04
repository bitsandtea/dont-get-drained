# How to Deploy Smart Contracts on 0G Galileo Testnet (Foundry)

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) installed (`forge`, `cast`)
- A wallet with testnet 0G tokens — get from the [0G faucet](https://faucet.0g.ai)
- Your private key in `dapp/.env` as `OG_DEPLOYER=<your_private_key>`

## Project Structure

```
dapp/
├── .env                        # Private key (OG_DEPLOYER)
├── foundry.toml                # Foundry config (cancun EVM, 0G RPC endpoints)
├── src/                        # Smart contracts
├── script/                     # Deployment scripts
├── test/                       # Tests
└── lib/forge-std/              # Forge standard library
```

## Step 1: Build

```bash
cd dapp
forge build
```

This compiles all contracts in `src/` using Solidity 0.8.19 with the `cancun` EVM version (required by 0G Chain).

## Step 2: Run Tests

```bash
forge test
```

Runs all tests in `test/`. You should see all passing before deploying.

## Step 3: Deploy + Verify AgentDirectory

```bash
source .env
forge script script/DeployDirectory.s.sol:DeployDirectory \
  --rpc-url https://evmrpc-testnet.0g.ai \
  --broadcast \
  --with-gas-price 3000000000 \
  --priority-gas-price 2000000000 \
  --verify \
  --verifier-url https://chainscan-galileo.0g.ai/open/api \
  --chain-id 16602
```

**Important:** The `--with-gas-price 3000000000 --priority-gas-price 2000000000` flags (3 gwei max fee, 2 gwei tip) are required because the 0G testnet enforces a minimum gas tip of 2 gwei. Without them, the transaction will fail with `gas tip cap below minimum`.

On success, copy the deployed address and add it to `frontend/.env.local`:

```bash
echo "NEXT_PUBLIC_DIRECTORY_ADDRESS=<address>" >> ../frontend/.env.local
```

View your contract at: `https://chainscan-galileo.0g.ai/address/<DEPLOYED_CONTRACT_ADDRESS>`

## Step 4: Deploy InferenceGuard + Safe (Forked Mainnet)

The `DeployGuard` script runs against a **local Anvil fork of Ethereum mainnet** (not 0G). It deploys a **Safe**, the **InferenceGuard**, funds the Safe with 5 ETH, and installs the guard — all in one transaction batch. It uses Safe v1.3.0 canonical mainnet factory addresses.

**Required `.env` variables:**

```bash
# dapp/.env
OG_DEPLOYER=<owner_private_key>       # Safe owner / deployer
RELAYER_PRIVATE_KEY=<relayer_key>     # Off-chain relayer that submits AI verdicts
```

**Start a local Anvil fork:**

```bash
anvil --fork-url https://eth-mainnet.g.alchemy.com/v2/<YOUR_KEY>
```

**Deploy (in a separate terminal):**

```bash
cd dapp
source .env
forge script script/DeployGuard.s.sol:DeployGuard \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast
```

The script will log:

```
=== DEPLOYED ===
Safe:           0x...
InferenceGuard: 0x...
Guard installed on Safe
```

Copy the output addresses to `frontend/.env.local`:

```bash
echo "NEXT_PUBLIC_GUARD_ADDRESS=<guard_address>" >> ../frontend/.env.local
echo "NEXT_PUBLIC_SAFE_ADDRESS=<safe_address>" >> ../frontend/.env.local
```

> **Note:** The deployer needs >6 ETH for the script to auto-fund the Safe with 5 ETH. On Anvil, the default accounts have 10,000 ETH each. If using your own key, fund it first with `cast send <your_address> --value 100ether --from 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url http://127.0.0.1:8545`.

## Step 5: Fund the Safe (Local Anvil Fork)

When running against a local Anvil fork, the Safe needs ETH to execute swaps. Use the funding script:

```bash
# Fund Safe with 10 ETH (default, from Anvil account #0)
./scripts/fund-safe.sh

# Fund with a custom amount
./scripts/fund-safe.sh 50

# Use your own private key
PRIVATE_KEY=0x... ./scripts/fund-safe.sh 5
```

The script shows sender and Safe balances before/after the transfer.

## Useful Commands

| Command | Description |
|---|---|
| `forge build` | Compile contracts |
| `forge test` | Run tests |
| `forge test -vvvv` | Run tests with full trace output |
| `cast balance <address> --rpc-url https://evmrpc-testnet.0g.ai` | Check wallet balance |
| `cast call <contract> "balances(address)" <address> --rpc-url https://evmrpc-testnet.0g.ai` | Read token balance |
| `cast send <contract> "transfer(address,uint256)" <to> <amount> --rpc-url https://evmrpc-testnet.0g.ai --private-key $OG_DEPLOYER --gas-price 3000000000 --priority-gas-price 2000000000` | Send tokens |

## Network Reference

| Network | RPC URL | Chain ID | Explorer |
|---|---|---|---|
| Testnet (Galileo) | `https://evmrpc-testnet.0g.ai` | 16602 | [chainscan-galileo.0g.ai](https://chainscan-galileo.0g.ai) |
| Mainnet | `https://evmrpc.0g.ai` | 16661 | [chainscan.0g.ai](https://chainscan.0g.ai) |
