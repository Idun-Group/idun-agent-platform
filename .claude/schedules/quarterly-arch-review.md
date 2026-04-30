# Quarterly Architecture Review

**Cadence:** first week of each quarter
**Output:** ADR drafts in `docs/adr/` (or vault under `product/adrs/`)
**Required tools:** Read, Grep/Bash, GitHub MCP (issue write), vault MCP

## Goal

Produce a short, opinionated report on architectural drift between the
*stated* architecture (CLAUDE.md files + vault `product/architecture.md`) and
the *actual* code. Output ADR drafts for any drift worth ratifying or
reversing. This is the schedule the CEO/tech-lead reads in full.

## Steps

1. Read the source of truth:
   - Root `CLAUDE.md` and all per-service `CLAUDE.md` files.
   - Vault note `product/architecture.md`.
   - Vault note `product/conventions.md`.
   - Last quarter's compressed session logs from the vault.
2. Build a current-state snapshot of:
   - Module boundaries: what `libs/` and `services/` actually depend on,
     compared to what the docs say they depend on.
   - Public API surface of `idun_agent_engine` and `idun_agent_schema`.
   - Concurrency model: where sync code crept into async paths.
   - Auth boundaries in the manager: any new routes that bypass the existing
     middleware?
   - Multi-tenancy invariants: workspace scoping on every read/write.
3. Identify drift in three buckets:
   - **Ratify** — the code is right, the docs are stale. Draft an ADR
     accepting the new pattern.
   - **Reverse** — the docs are right, the code drifted. Draft an ADR with
     a remediation plan and effort estimate.
   - **Decide** — both are defensible. Frame the trade-off and ask for a
     decision; do not pick.
4. Write each ADR as a short markdown file (max 1 page) with: context,
   decision, status, consequences, alternatives.
5. File one issue per ADR labeled `adr:proposed`, linking the draft and the
   evidence. Do not merge ADRs autonomously.
6. Append a one-paragraph executive summary to the vault under
   `product/quarterly-reviews/<YYYY-Q#>.md`.

## What to look at specifically

- Does `idun_agent_schema` still own all cross-package types, or have
  duplicates appeared in engine/manager?
- Are observability backends (Langfuse, Phoenix, LangSmith, OTel) still
  pluggable, or has one become load-bearing?
- Are guardrails still optional and composable?
- Has the AG-UI streaming protocol stayed stable, or have endpoints diverged?
- Is the engine still embeddable as an SDK, or has it grown
  manager-specific assumptions?

## Constraints

- This is the only schedule allowed to propose architectural changes.
- Never edit existing ADRs — propose superseding ones instead.
- Keep each ADR under one page. If it needs more, the decision isn't ripe.
