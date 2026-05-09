# Architecture Decision Records

This directory holds the architectural decision records (ADRs) for `idun-agent-platform`. Each ADR captures one decision: the context, the choice, the alternatives considered, and the consequences.

## When to write an ADR

Per rule **ADR-001** in `docs/team/CODING-GUIDELINES.md`: any architectural change must be accompanied by an ADR in the same PR. Examples:
- Choosing a new framework, runtime, or external service.
- Changing the contract between two packages (e.g., schema/engine/standalone).
- Reversing or replacing an existing ADR.
- Decisions that affect multiple packages or the public API.

Bug fixes, refactors, dependency bumps, and feature work that fits within an existing pattern do NOT need ADRs.

## How to write one

1. Copy `_template.md` to `NNNN-short-title.md` (next sequential number).
2. Fill every section. Keep it short — one screen is the target.
3. Link the ADR from your PR description.
4. Status starts at `Proposed`. Change to `Accepted` after the PR merges. Use `Superseded by NNNN-...` when later replaced.

## Index

- [0001 — Record architectural decisions](0001-record-architectural-decisions.md) — meta: this practice
