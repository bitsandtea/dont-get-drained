# Guard Removal Timelock

## Problem

Currently in `AIGuard.sol`, any `setGuard()` call bypasses the guard entirely:

```solidity
if (to == safe && _isSetGuard(data)) return;
```

A compromised owner key can instantly remove the guard and drain the Safe in the same block. There is no window for detection or response.

## Proposed Solution

Add a 24-hour timelock to guard removal. Changing to a new guard or removing the guard (`setGuard(address(0))`) requires a two-step process with a mandatory delay.

## Contract Changes

### New State

```solidity
uint256 public constant GUARD_REMOVAL_DELAY = 24 hours;

address public pendingGuardRemoval;     // requested new guard (address(0) for removal)
uint256 public guardRemovalRequestedAt; // timestamp of request, 0 = no pending request
```

### New Functions

#### `requestGuardRemoval(address newGuard)`

- Starts the 24h countdown
- Only callable by Safe owners (`ISafe(safe).isOwner(msg.sender)`)
- Stores `pendingGuardRemoval` and `guardRemovalRequestedAt = block.timestamp`
- Emits `GuardRemovalRequested(address indexed newGuard, uint256 executeAfter)`

#### `cancelGuardRemoval()`

- Cancels a pending request
- Only callable by Safe owners
- Resets `pendingGuardRemoval` and `guardRemovalRequestedAt` to zero
- Emits `GuardRemovalCancelled()`

### Modified `checkTransaction`

Replace the current bypass:

```solidity
// BEFORE
if (to == safe && _isSetGuard(data)) return;

// AFTER
if (to == safe && _isSetGuard(data)) {
    require(guardRemovalRequestedAt != 0, "Guard removal not requested");
    require(
        block.timestamp >= guardRemovalRequestedAt + GUARD_REMOVAL_DELAY,
        "Timelock not expired"
    );

    // Verify the setGuard target matches the pending request
    address targetGuard = abi.decode(_slice(data, 4, 36), (address));
    require(targetGuard == pendingGuardRemoval, "Target guard mismatch");

    // Reset state
    guardRemovalRequestedAt = 0;
    pendingGuardRemoval = address(0);
    return;
}
```

## Flow

```
Owner calls requestGuardRemoval(address(0))
        │
        ▼
   24 hours pass
        │
        ▼
Owner executes setGuard(address(0)) through Safe
        │
        ▼
checkTransaction verifies timelock expired + target matches
        │
        ▼
Guard removed
```

If the owner key is compromised, the 24h window gives the team time to:
- Cancel the removal via `cancelGuardRemoval()` from another owner
- Rotate the compromised key
- Alert monitoring systems

## Events

```solidity
event GuardRemovalRequested(address indexed newGuard, uint256 executeAfter);
event GuardRemovalCancelled();
```

## Frontend Support Needed

- "Request Guard Removal" button (calls `requestGuardRemoval` directly on the guard contract)
- Countdown timer showing time remaining
- "Cancel Removal" button
- Disable `setGuard` execution until timelock expires

## Notes

- `requestGuardRemoval` is called directly on the AIGuard contract, not through the Safe's `execTransaction` — this avoids a circular dependency where the guard would need to approve its own removal request
- The timelock only applies to guard changes, not to normal swap operations
- For multi-sig Safes, any single owner can request removal but any other owner can also cancel it — this creates a check-and-balance
- Redeployment of the guard contract is required since this changes contract state and logic
