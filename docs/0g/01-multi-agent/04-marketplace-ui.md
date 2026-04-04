# 04 — Marketplace UI

**Status**: TODO  
**Depends on**: 03 (Agent API routes)

## What

A frontend page at `/marketplace` where users browse all published security agents and can add them to their guard's panel.

## File to Create

`frontend/app/marketplace/page.tsx`

## Design

### Layout
- Grid of agent cards (2-3 columns on desktop, 1 on mobile)
- Each card shows: name, description, capability tags, price badge, usage count, creator address
- "Add to Panel" button per card (disabled if no Safe connected or no guard set)
- Filter/search bar at top (filter by capability tags)
- Link to "Create Agent" page

### Agent Card

```
┌─────────────────────────────┐
│ RektNewsChecker             │
│ ──────────────────────────  │
│ DeFi exploit pattern        │
│ detection and analysis      │
│                             │
│ [exploit-detection] [pattern]│
│                             │
│ Price: FREE                 │
│ Used: 42 times              │
│ By: 0x1234...5678           │
│                             │
│ [Add to Panel]              │
└─────────────────────────────┘
```

### Data Source
- `GET /api/agents` → returns all agents
- Filter active agents only (agent.active === true)
- Show capability tags as colored chips

### Interactions
- Click card → expand or navigate to detail view
- "Add to Panel" → calls panel management (task 09)
- "Create Agent" link → navigates to `/agents/create`

## Notes
- Check `frontend/AGENTS.md` — this Next.js has breaking changes. Read `node_modules/next/dist/docs/` first.
- Match existing UI style from `page.tsx` (dark theme, card-based layout)
- The page should work without a connected wallet (browse mode), but "Add to Panel" requires wallet + Safe
