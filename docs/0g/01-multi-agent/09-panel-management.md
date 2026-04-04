# 09 — Panel Management API + UI

**Status**: TODO  
**Depends on**: 06 (InferenceGuard with panel), 03 (Agent API)

## What

API route and UI for configuring which agents a guard uses and the aggregation policy.

## Files to Create

### `frontend/app/api/guard/panel/route.ts`

**GET /api/guard/panel?guardAddress=0x...**

```typescript
// 1. Connect to InferenceGuard on Anvil RPC
// 2. Read guard.getPanel() → bytes32[]
// 3. Read guard.policy() → uint8
// 4. For each agentId, resolve name from AgentDirectory on 0G RPC
// 5. Return { panel: AgentConfig[], policy: string }
```

**PUT /api/guard/panel**

```typescript
// Body: { guardAddress, agentIds: string[], policy: number }
//
// This requires a Safe transaction because setPanel/setPolicy
// can only be called by the Safe itself.
//
// Flow:
// 1. Encode calldata: guard.setPanel(agentIds) + guard.setPolicy(policy)
// 2. Return encoded calldata for the frontend to submit via Safe.execTransaction
//    (the frontend signs and executes, not the API)
//
// OR for demo simplicity:
// 1. Use relayer to call directly if we add relayer permissions for panel management
```

### UI in `frontend/app/page.tsx` (Safe Explorer section)

Add a "Panel" section visible when a guard is detected:

```
┌─────────────────────────────────┐
│ Agent Panel                     │
│                                 │
│ 1. RektNewsChecker        [x]  │
│ 2. SimulationAnalyst      [x]  │
│ 3. AddressSafetyAuditor   [x]  │
│                                 │
│ Policy: [Majority ▾]           │
│                                 │
│ [+ Add Agent] [Save Panel]     │
└─────────────────────────────────┘
```

- "Add Agent" → links to `/marketplace`
- Remove agent: click [x] on each
- Policy dropdown: Unanimous / Majority / Any Reject
- "Save Panel" → encodes `setPanel` + `setPolicy` and submits as Safe tx

## Alternative: Standalone Page

If modifying `page.tsx` is too complex, create `frontend/app/panel/page.tsx` as a standalone panel management page.

## Notes
- `setPanel` and `setPolicy` require `msg.sender == safe`, so these must be executed as Safe transactions (user signs via MetaMask)
- The review API reads the panel from the guard contract, so panel config must be on-chain
- For hackathon: can pre-configure panel in the deploy script to skip this UI
