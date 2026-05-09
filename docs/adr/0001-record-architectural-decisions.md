# 0001. Record architectural decisions as ADRs

- **Status:** Accepted
- **Date:** 2026-05-09
- **Authors:** Geoffrey Harrazi
- **Affected packages:** all

## Context

The project's CLAUDE.md hierarchy and SPEC.md (Phase 0 of the coding-guideline rollout) require that architectural decisions be reviewable and durable. Today, decisions live in PR descriptions, Slack threads, or implicit code structure — they're hard to find later and impossible to audit.

## Decision

Adopt **Architecture Decision Records** (ADRs) at `docs/adr/NNNN-title.md`. Use the Michael Nygard format (Context / Decision / Consequences). Numbering is sequential; once assigned, never re-used. ADRs are immutable in spirit (we add new ones to supersede, we don't rewrite old ones).

The PR-review subagent enforces rule **ADR-001** advisorily: PRs that change architecture without adding an ADR get flagged.

## Alternatives considered

- **No formal record.** Status quo. Rejected — institutional memory keeps decaying.
- **A single `ARCHITECTURE.md`.** Single file, single owner. Rejected — doesn't track decision evolution; merge conflicts pile up.
- **Wiki / Notion / Confluence.** External, searchable, but not versioned with the code; gets stale.

## Consequences

- **Positive:** every architectural decision has a stable, reviewable, versioned home. New contributors can read `docs/adr/` to understand why the system is shaped the way it is.
- **Negative:** small overhead per decision (~30 minutes to write a good ADR). Mitigated by `_template.md` and a tight format.
- **Neutral:** ADRs need someone to enforce ADR-001; the PR-review subagent does this advisorily.

## References

- [Michael Nygard — Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- `docs/team/CODING-GUIDELINES.md` (rule ADR-001)
- `idun-dev/tasks/coding-guidelines-09-05-2026/SPEC.md` (§5.5 workflow rules)
