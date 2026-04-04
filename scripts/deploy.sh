#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "================================"
echo "  AIGuard + Safe Deployment"
echo "================================"
echo ""

# ── Ensure Anvil is running ──
if curl -s http://127.0.0.1:8545 -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
  echo "Anvil already running on port 8545"
else
  echo "Starting Anvil (mainnet fork)..."
  anvil --fork-url https://ethereum-rpc.publicnode.com --host 127.0.0.1 --port 8545 --chain-id 31337 &
  ANVIL_PID=$!
  # Wait for it to be ready
  for i in $(seq 1 10); do
    if curl -s http://127.0.0.1:8545 -X POST -H "Content-Type: application/json" \
      --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
  if ! curl -s http://127.0.0.1:8545 -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
    echo "ERROR: Anvil failed to start within 5s"
    kill "$ANVIL_PID" 2>/dev/null || true
    exit 1
  fi
  echo "Anvil started (PID $ANVIL_PID)"
fi
echo ""

# ── Load dapp env ──
set -a
source "$ROOT/dapp/.env"
set +a

# ── Deploy via Foundry ──
echo "Deploying Guard + Safe..."
echo ""
OUTPUT=$(cd "$ROOT/dapp" && forge script script/DeployGuard.s.sol:DeployGuard \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  -vvv 2>&1) || {
  echo "Forge script failed:"
  echo "$OUTPUT"
  exit 1
}

# ── Parse addresses from forge console.log output ──
# Lines look like: "  Safe:      0x..." and "  AIGuard:   0x..."
SAFE_ADDR=$(echo "$OUTPUT" | grep "NEXT_PUBLIC_SAFE_ADDRESS" | awk '{print $NF}')
GUARD_ADDR=$(echo "$OUTPUT" | grep "NEXT_PUBLIC_GUARD_ADDRESS" | awk '{print $NF}')

if [[ -z "$SAFE_ADDR" || -z "$GUARD_ADDR" ]]; then
  # Fallback: try the "=== DEPLOYED ===" section
  SAFE_ADDR=$(echo "$OUTPUT" | grep "Safe:" | grep -v "COPY" | grep -v "CONFIG" | grep -v "fund" | head -1 | awk '{print $NF}')
  GUARD_ADDR=$(echo "$OUTPUT" | grep "AIGuard:" | head -1 | awk '{print $NF}')
fi

if [[ -z "$SAFE_ADDR" || -z "$GUARD_ADDR" ]]; then
  echo "Failed to parse addresses from deployment output."
  echo ""
  echo "Raw output:"
  echo "$OUTPUT"
  exit 1
fi

# ── Update frontend/.env.local ──
ENV_FILE="$ROOT/frontend/.env.local"
if [[ -f "$ENV_FILE" ]]; then
  sed -i '' "s|^NEXT_PUBLIC_SAFE_ADDRESS=.*|NEXT_PUBLIC_SAFE_ADDRESS=$SAFE_ADDR|" "$ENV_FILE"
  sed -i '' "s|^NEXT_PUBLIC_GUARD_ADDRESS=.*|NEXT_PUBLIC_GUARD_ADDRESS=$GUARD_ADDR|" "$ENV_FILE"
else
  cat > "$ENV_FILE" <<EOF
NEXT_PUBLIC_GUARD_ADDRESS=$GUARD_ADDR
NEXT_PUBLIC_SAFE_ADDRESS=$SAFE_ADDR
RPC_URL=http://127.0.0.1:8545
RELAYER_PRIVATE_KEY=$RELAYER_PRIVATE_KEY
EOF
fi

# ── Summary ──
echo ""
echo "========================================"
echo "  Deployment Complete"
echo "========================================"
echo ""
echo "  Safe:      $SAFE_ADDR"
echo "  AIGuard:   $GUARD_ADDR"
echo "  Guard set: YES"
echo "  Funded:    5 ETH (if deployer had balance)"
echo ""
echo "  frontend/.env.local updated."
echo "  Restart the frontend to pick up new addresses."
echo ""
echo "========================================"
