#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
SAFE_ADDRESS="0xb1336dd0B16aE3E34Ed559D3576De7567C93ca70"
AMOUNT="${1:-10}"  # ETH to send, default 10
PRIVATE_KEY="${PRIVATE_KEY}"

# Derive sender address from private key
SENDER=$(cast wallet address "$PRIVATE_KEY")

echo "=== Fund Safe ==="
echo "RPC:    $RPC_URL"
echo "Sender: $SENDER"
echo "Safe:   $SAFE_ADDRESS"
echo "Amount: ${AMOUNT} ETH"
echo ""

# Check sender balance
SENDER_BAL=$(cast balance "$SENDER" --rpc-url "$RPC_URL" --ether)
echo "Sender balance: ${SENDER_BAL} ETH"

# Check safe balance before
SAFE_BAL_BEFORE=$(cast balance "$SAFE_ADDRESS" --rpc-url "$RPC_URL" --ether)
echo "Safe balance:   ${SAFE_BAL_BEFORE} ETH"
echo ""

# Send ETH
echo "Sending ${AMOUNT} ETH to Safe..."
cast send "$SAFE_ADDRESS" \
  --value "${AMOUNT}ether" \
  --private-key "$PRIVATE_KEY" \
  --rpc-url "$RPC_URL" \
  > /dev/null

# Check safe balance after
SAFE_BAL_AFTER=$(cast balance "$SAFE_ADDRESS" --rpc-url "$RPC_URL" --ether)
echo "Safe balance:   ${SAFE_BAL_BEFORE} ETH -> ${SAFE_BAL_AFTER} ETH"
echo ""
echo "Done."
