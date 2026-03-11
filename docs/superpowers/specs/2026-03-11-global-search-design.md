# Global Search Dropdown

## Problem

Users have no way to quickly find agents or configs across the platform. Each page has its own local search, but there's no cross-entity search. The header already has a non-functional search placeholder with a `⌘K` hint.

## Solution

Replace the static search placeholder in the header center zone with a live search input. When the user types and pauses (~800ms debounce), a dropdown appears below showing results grouped by category. Max 3 results per category; clicking a category header expands to show all results for that category.

## Scope

**Searchable entities** (scoped to current project):
- Agents — name, description, framework
- Observability configs — name, provider
- Memory configs — name, provider
- MCP servers — name, provider
- Guardrails — name, provider/type

**Not in scope**: Users, integrations, SSO, projects.

## Data Strategy

Client-side. On first dropdown open, fetch all entities in parallel via existing service functions (`listAgents`, `fetchApplications`). Cache in component state. Filter instantly as the user types. No new backend endpoints needed.

Typical workspace sizes (< 50 agents, < 20 configs per category) make this fast and simple.

## UI Design

### Search Bar
- Replaces the current `SearchPlaceholder` in `CenterZone` of the header
- Real `<input>` with search icon, placeholder "Search..."
- On focus: purple border glow (`box-shadow: 0 0 0 3px hsla(262, 83%, 58%, 0.08)`)
- On blur with no text: reverts to placeholder state

### Dropdown (Overview)
- Appears after ~800ms debounce of typing
- Positioned below the search bar, same width
- Grouped by category with sections separated by subtle border
- Each section has:
  - **Header row**: category icon + uppercase label + count badge (e.g., "AGENTS 5")
  - **Result rows** (max 3): icon box + name with match highlighting + metadata tag
  - **"See all N" link**: shown when results exceed 3, navigates to expanded view
- Category header is clickable — expands that category
- Outside click or Escape closes the dropdown

### Dropdown (Expanded Category)
- Replaces the overview with a single-category view
- Back button (← arrow) returns to overview
- Header shows: back button + category icon + category name + "N results"
- Scrollable list of all matching results (max-height with overflow)
- Each row: icon + highlighted name + metadata

### Icons per Category
- Agents: `Bot` (lucide-react)
- Observability: `Activity`
- Memory: `Database`
- MCP: `Wrench`
- Guardrails: `ShieldCheck`

### Match Highlighting
- Matched substring rendered in `hsl(var(--primary))` with `font-weight: 600`
- Case-insensitive matching

### Empty State
- Search icon with minus, "No results for "query""
- Centered in the dropdown

### Result Click Behavior
- **Agents**: navigate to `/agents/{id}`
- **Configs** (observability, memory, MCP, guardrails): navigate to `/{category}` page (configs don't have individual detail pages)

## Component Architecture

### New Component: `GlobalSearch`
Location: `src/components/global-search/component.tsx`

**State**:
- `query: string` — current search text
- `isOpen: boolean` — dropdown visibility
- `expandedCategory: string | null` — which category is expanded (null = overview)
- `cache: { agents, observability, memory, mcp, guardrails }` — fetched data, loaded once on first open
- `isLoading: boolean` — loading state for initial fetch

**Behavior**:
1. On focus + first keystroke: if cache is empty, fetch all entities in parallel
2. On input change: reset debounce timer (800ms)
3. After debounce: filter cached data, open dropdown if results exist
4. On result click: navigate to entity, close dropdown
5. On category header click or "See all" click: set `expandedCategory`
6. On back button click: clear `expandedCategory`
7. On outside click or Escape: close dropdown, clear expanded
8. On blur with empty query: close dropdown

### Header Integration
Replace `SearchPlaceholder` in `header/layout.tsx` with `<GlobalSearch />`.

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/components/global-search/component.tsx` | New component |
| `src/layouts/header/layout.tsx` | Replace SearchPlaceholder with GlobalSearch |

## Existing Utilities to Reuse

- `listAgents()` from `services/agents.ts`
- `fetchApplications()` from `services/applications.ts` — filter by category
- `useProject()` hook — `selectedProjectId` for cache invalidation
- `useNavigate()` — navigation on result click
- `useTranslation()` — i18n for placeholder and labels
