# 05 — Agent Creation UI

**Status**: TODO  
**Depends on**: 03 (Agent API routes)

## What

A frontend page at `/agents/create` where users write a prompt template, set metadata, and publish a new agent. The prompt is stored on **0G Storage** and the agent is registered on AgentDirectory (0G testnet).

## File to Create

`frontend/app/agents/create/page.tsx`

## Design

### Form Fields

1. **Name** — text input, required (e.g. "RektNewsChecker")
2. **Description** — textarea, required (what this agent does)
3. **Prompt Template** — large textarea/code editor, required
   - Show available variables sidebar (same pattern as `frontend/app/admin/page.tsx`)
   - Variables: `{{signer}}`, `{{recipient}}`, `{{safeAddress}}`, `{{txTarget}}`, `{{txData}}`, `{{txValue}}`, `{{amountIn}}`, `{{outputAmount}}`, `{{tokenSymbol}}`, `{{tokenOut}}`, `{{routing}}`, `{{gasFeeUSD}}`, `{{intent}}`, `{{simulationResults}}`, `{{USDC}}`, `{{DAI}}`, `{{WETH}}`
4. **Capabilities** — tag input, comma-separated (e.g. "exploit-detection, simulation-analysis")
5. **Price** — number input in ETH, defaults to 0 (FREE)

### Publish Flow

```
User fills form → clicks "Publish Agent"
       |
       v
POST /api/agents {
  name, description, promptTemplate,
  pricePerInference: 0,
  capabilities: "exploit-detection,simulation"
}
       |
       v
API stores prompt on 0G Storage → promptCid
API registers on AgentDirectory → agentId
       |
       v
Success screen: "Agent published!"
  - Agent ID (copyable)
  - 0G Storage hash (promptCid)
  - Link to marketplace
```

### Edit Mode (optional)

If accessed with `?id=0x...` query param:
- Load existing agent from `/api/agents/[id]`
- Pre-fill form with current values
- "Update" button calls `PUT /api/agents/[id]` (stores new prompt on 0G, updates on-chain)

## Reference

The existing prompt admin page at `frontend/app/admin/page.tsx` has a similar pattern — a textarea with variable reference sidebar. Reuse that pattern.

## Notes
- Check `frontend/AGENTS.md` — Next.js breaking changes. Read `node_modules/next/dist/docs/` first.
- Match existing dark theme UI style
- Prompt validation: ensure template is non-empty and contains at least one `{{variable}}`
- Show clear feedback during publish (loading state → success/error)
