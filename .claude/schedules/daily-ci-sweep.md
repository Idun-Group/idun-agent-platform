# Daily CI Sweep

**Cadence:** every 24 hours
**Rolling issue label:** `schedule:ci-sweep`
**Required tools:** GitHub MCP (read + issue write), Bash (read-only git)

## Goal

Detect CI failures and flaky tests on `main` over the last 24 hours, dedupe by
error signature, and update one rolling GitHub issue with the current state.
Do **not** open new issues each run.

## Steps

1. List workflow runs on `main` from the last 24h. Capture: workflow name,
   conclusion, run URL, head SHA, duration.
2. For each `failure` or `cancelled` run, fetch the failed job logs and extract
   the first error block (stack trace head, assertion message, or non-zero
   command).
3. **Flake detection:** group runs by `(workflow, job, error signature)`. Mark
   a group as flaky if it contains both `success` and `failure` outcomes for
   the same SHA, or if a re-run of the same SHA passed.
4. Find the rolling issue with label `schedule:ci-sweep`. If none, create one
   titled `[schedule] CI health — daily sweep`.
5. Replace the issue body with a markdown table:
   - Failures (non-flaky) — workflow, job, signature, first seen, run link
   - Flaky tests — workflow, job, signature, flake count over 7d
   - Slowest jobs (top 5) — for trend awareness
6. If a non-flaky failure has persisted for 48h, escalate by leaving a comment
   on the rolling issue tagging the last committer to that workflow file.

## Non-goals

- Do not attempt to fix failures.
- Do not re-run jobs.
- Do not file separate issues per failure.

## Failure modes

If the GitHub API is unreachable, write a single comment on the rolling issue:
`Sweep skipped at <ISO timestamp>: <reason>`. Do not retry within the same run.
