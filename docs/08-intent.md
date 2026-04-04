# 08 — Swap Intent Declaration

## Overview

Before every swap, the user must provide a short **intent statement** — a plain-English explanation of *why* they are making this trade. The intent is passed to Mr. Inference alongside the swap parameters so the AI reviewer has human context, not just raw numbers.

## Motivation

A bare swap request ("1 ETH → USDC") tells the AI guard *what* is happening but not *why*. Adding an intent field gives Mr. Inference a richer signal to evaluate risk:

- **"Moving 1 ETH to USDC to stabilize value ahead of conference expenses"** → routine treasury management, low risk.
- **"Swapping 50 ETH into an unknown meme token because it's pumping"** → the stated intent itself is a red flag the AI can weigh.

Intent also creates an auditable record of decision-making that is stored alongside the inference result on 0G Storage.

## User Flow

1. **Step 0 – Configure Swap** (existing): pick token, enter amount.
2. **New: Enter Intent** — a required text area appears below the amount/token selector:
   > *"Describe why you're making this swap (e.g. 'converting ETH to USDC to cover upcoming vendor payment')"*
3. **Step 1 – Mr. Inference Review**: intent is included in the prompt and visible in the review card.
4. **Step 2 – Execute**: intent is stored on-chain/0G alongside the verdict.

## Data Flow

```
Frontend (page.tsx)
  ├─ new state: swapIntent (string)
  ├─ textarea in Step 0 form
  └─ POST /api/review  ← body now includes { tokenOut, amountIn, recipient, intent }

API route (review/route.ts)
  ├─ receives `intent` from body
  ├─ adds {{intent}} to prompt template variables
  └─ stores intent in fullResult.swapParams

Prompt template (prompt-store.ts)
  ├─ new line: "- User's stated intent: {{intent}}"
  └─ appended after swap details, before known safe tokens

0G Storage
  └─ fullResult now includes swapParams.intent
```

## Prompt Change

Add the following line to `DEFAULT_PROMPT_TEMPLATE` after the swap details block:

```
- User's stated intent: {{intent}}
```

This gives Mr. Inference a new dimension to evaluate: does the stated intent match the swap parameters? A mismatch (e.g. intent says "small test swap" but amount is 100 ETH) is itself a flag.

## Validation

- Intent is **required** — the "Next" button is disabled until the field is non-empty.
- Minimum length: 10 characters (prevents `"test"` or `"asdf"`).
- Intent is trimmed and stored as-is; no sanitization beyond whitespace trimming (the AI prompt is server-side only).

## Example Intents

| Intent | AI Signal |
| :--- | :--- |
| "Converting 1 ETH to USDC to lock in current price before travel" | Routine, matches small amount — low risk |
| "Hedging ETH exposure into DAI before market close" | Standard DeFi strategy — low risk |
| "Swapping into SHIB because my friend said it's going to 100x" | Speculative, unknown token — flag for review |
| "Treasury rebalance per Q2 mandate" | Institutional context — likely approved |

## Implementation Checklist

- [ ] Add `swapIntent` state to `page.tsx`
- [ ] Add textarea to Step 0 (Configure Swap) section
- [ ] Gate "Next" button on non-empty intent (min 10 chars)
- [ ] Pass `intent` in POST body to `/api/review`
- [ ] Accept `intent` in `review/route.ts` and include in prompt vars
- [ ] Add `{{intent}}` placeholder to `DEFAULT_PROMPT_TEMPLATE`
- [ ] Include `intent` in `fullResult.swapParams` for 0G storage
- [ ] Display intent in the Mr. Inference review card (Step 1)
