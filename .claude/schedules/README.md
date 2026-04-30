# Scheduled Maintenance Prompts

Each file in this directory is a self-contained prompt designed to be run on a
recurring interval — either via `/loop <interval> <command>` inside a Claude
Code session, or via a CI workflow that invokes `claude` non-interactively.

## Starter set

| File | Cadence | Purpose |
| --- | --- | --- |
| `daily-ci-sweep.md` | Daily | Detect failed/flaky CI runs, dedupe by signature, file one rolling issue. |
| `weekly-claude-md-audit.md` | Weekly | Verify each `CLAUDE.md` matches the actual tree; auto-PR fixes. |
| `weekly-docs-code-sync.md` | Weekly | Detect drift between `docs/` and engine/manager surface. |
| `weekly-test-gap-report.md` | Weekly | Surface recently-changed files with no test changes. |
| `monthly-dep-upgrade.md` | Monthly | Bump non-major Python + Node deps, open one PR per ecosystem. |
| `quarterly-arch-review.md` | Quarterly | Architectural drift report and ADR drafts. |

## Conventions

1. **One rolling issue per schedule.** Each prompt updates a pinned issue
   labeled `schedule:<name>` instead of opening new issues each run. This keeps
   noise bounded.
2. **Auto-PR over auto-issue** when the fix is mechanical (drift, generated
   clients, dep bumps). Issues are for judgment calls.
3. **No silent failures.** If a step cannot complete (e.g. CI not reachable),
   the prompt must report that explicitly in the rolling issue.
4. **Scoped permissions.** Each schedule should run with the minimum tool set
   it needs — read-only for audits, GitHub write for PR-creating ones.

## Running locally

```bash
# In a Claude Code session
/loop 1d "$(cat .claude/schedules/daily-ci-sweep.md)"
```

## Running in CI

Wire each file to a GitHub Actions cron workflow that invokes `claude -p` with
the file's contents as the prompt. Recommended: keep cron schedules in
`.github/workflows/scheduled-*.yml`, one workflow per cadence bucket.
