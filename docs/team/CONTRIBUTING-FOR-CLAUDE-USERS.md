# Contributing to idun-agent-platform with Claude Code

This guide is for Idun engineers using Claude Code on this repository. External OSS contributors should start with [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

## One-time setup

```bash
# 1. Install the team plugin (one-time per machine)
claude /plugin marketplace add Idun-Group/idun-dev
claude /plugin install idun-team@idun
claude /reload-plugins

# 2. Verify
claude /idun-team:onboarding-check
```

## Daily flow

1. Branch off `develop`: `git checkout -b feat/<topic> origin/develop`.
2. Use Claude Code normally. The PostToolUse hook surfaces lint findings as you Edit/Write Python or TypeScript.
3. Before pushing, run `/idun-team:review-pr` — this dispatches the code-reviewer subagent against your diff and prints findings.
4. Address `warn`/`block` findings; `advise` findings are optional but worth a look.
5. Push and open a PR. CI's `guidelines-check` runs automatically (advisory). The `guidelines-review` job is gated on the repo variable `GUIDELINES_REVIEW_ENABLED=true` plus the `ANTHROPIC_API_KEY` secret — set both when the team is ready to enable headless-Claude review on every PR.

## Slash commands

| Command | What it does |
| --- | --- |
| `/idun-team:review-pr` | Code-review your branch's diff against the rule book. |
| `/idun-team:audit-guidelines` | Drift-check: confirm generated outputs match the YAML source. |
| `/idun-team:render-guidelines` | Regenerate `docs/team/CODING-GUIDELINES.md`, `CONTRIBUTING.md` fragment, `CLAUDE.md` fragment, and the code-reviewer subagent. |
| `/idun-team:onboarding-check` | Verify your setup. |
| `/idun-team:preserve` | Capture a durable team learning. |
| `/idun-team:feature-loop` | Multi-stage feature development orchestrator. |

## The rule book

[`CODING-GUIDELINES.md`](./CODING-GUIDELINES.md) is auto-generated from YAML. Never edit it by hand — your edits will be overwritten on the next render. To change a rule:

- **Generic rule** (applies to all Idun repos): edit `idun-dev/.claude/guidelines/rules/<id>.yaml`, run the renderer, open a PR in `idun-dev`.
- **Project-specific rule** (this repo only): edit `.claude/guidelines/rules/<id>.yaml`, run `/idun-team:render-guidelines`, commit, open a PR here.

Severity tiers in v1:
- `block` — none yet (advisory rollout).
- `warn` — fix before merge if practical.
- `advise` — consider; not blocking.

## Editing CLAUDE.md and CONTRIBUTING.md

Both files contain auto-generated fragments between `<!-- BEGIN: generated-by render_guidelines -->` and `<!-- END: generated-by render_guidelines -->` markers. Hand-edits OUTSIDE the markers are preserved across regeneration. Hand-edits INSIDE the markers will be overwritten — change the source YAML instead.

## Architecture decisions

When making an architectural change, add an ADR under `docs/adr/`. Copy `_template.md`, increment the number, and link it from your PR description. Rule **ADR-001** flags PRs that miss this.

## Pre-commit hook setup gotcha

If `pre-commit install --hook-type commit-msg` (used to enable the advisory commitlint hook) refuses to install because of an existing `core.hooksPath` git config, temporarily unset it:

```bash
# Save current value (defaults to repo's .git/hooks)
ORIGINAL=$(git config --get core.hooksPath || echo "")

# Unset, install, restore
git config --unset-all core.hooksPath
pre-commit install --hook-type commit-msg
[ -n "$ORIGINAL" ] && git config core.hooksPath "$ORIGINAL"
```

Net change to git config: zero. Required only on machines where `core.hooksPath` is set explicitly.

## Reporting a false positive

If `/idun-team:review-pr` flags a rule that's wrong:
1. Run `/idun-team:review-pr --rule <ID> --explain` (when supported) to see the reasoning.
2. If the rule's text is wrong, edit its YAML and PR the change.
3. If the rule applies but its severity is too high, propose demotion in the same YAML PR.

## Escalation

- Bug or unclear rule → file an issue with label `coding-guidelines`.
- Rule should be retired → PR a `state: retired` change to its YAML.
- Want to add a rule → propose it in an issue first; once accepted, add `state: proposed` then promote to `active` after a discussion.
