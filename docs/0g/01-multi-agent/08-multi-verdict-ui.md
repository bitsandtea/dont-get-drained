# 08 — Multi-Verdict UI

**Status**: TODO  
**Depends on**: 07 (multi-agent review flow)

## What

Update the review step in `page.tsx` to display individual agent verdicts as cards, show aggregation result, and the final verdict.

## File to Modify

`frontend/app/page.tsx`

## Changes to Step 1 (Mr. Inference Review)

### Current
Single verdict badge (APPROVED/REJECTED) with one AI answer.

### New
A panel of agent verdict cards + aggregation summary:

```
┌─────────────────────────────────────────────────┐
│  FINAL VERDICT: APPROVED (2/3 Majority)         │
├─────────────────────────────────────────────────┤
│                                                 │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│ │ RektNews    │ │ Simulation  │ │ Address     ││
│ │ Checker     │ │ Analyst     │ │ Auditor     ││
│ │   [PASS]    │ │   [PASS]    │ │   [FAIL]    ││
│ │             │ │             │ │             ││
│ │ No exploit  │ │ Balances    │ │ Unknown     ││
│ │ patterns    │ │ match       │ │ token addr  ││
│ │ detected.   │ │ expected.   │ │ flagged.    ││
│ │             │ │             │ │             ││
│ │ TEE: ✓      │ │ TEE: ✓      │ │ TEE: ✓      ││
│ └─────────────┘ └─────────────┘ └─────────────┘│
│                                                 │
│ Policy: Majority (>50% must approve)            │
│ Root Hash: 0xabc...def                          │
│                                                 │
│ [Approve On-Chain & Continue]                   │
└─────────────────────────────────────────────────┘
```

### Loading State

While inference is running, show each agent's status:
```
RektNewsChecker:     analyzing... ⏳
SimulationAnalyst:   done ✓
AddressSafetyAuditor: analyzing... ⏳
```

### Data Shape

The review response now includes `agents` array and `policy`. Parse and render:

```typescript
interface ReviewResponse {
  finalVerdict: boolean;
  policy: string;
  agents: Array<{
    agentId: string;
    name: string;
    verdict: boolean;
    notes: string;
    teeProof: { text: string; signature: string } | null;
    verified: boolean | null;
  }>;
  // ...existing fields
}
```

### Color Coding
- Green card border + checkmark for approved agents
- Red card border + X for rejected agents
- Final verdict: large green "APPROVED" or red "REJECTED" banner
- Policy displayed as subtitle: "2/3 agents approved (Majority)"

## Backward Compatibility

If `agents` array has 1 item with `agentId === "default"`: render single-agent view (same as current UI). Only show multi-card layout when multiple agents are present.

## Notes
- Check `frontend/AGENTS.md` — Next.js breaking changes
- Match existing dark theme and card style from current `page.tsx`
- Each agent card should be expandable to show full notes
