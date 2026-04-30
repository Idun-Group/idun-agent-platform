# Weekly Test Gap Report

**Cadence:** every 7 days
**Rolling issue label:** `schedule:test-gaps`
**Required tools:** Bash (git), Read, GitHub MCP (issue write)

## Goal

Surface code that changed in the last 7 days without corresponding test
changes. The output is a punch list, not a verdict — some gaps are legitimate
(typing-only changes, refactors, generated code).

## Steps

1. Compute the diff: `git log --since="7 days ago" --name-only --pretty=format: main`.
2. Filter to source files under:
   - `libs/idun_agent_engine/src/`
   - `libs/idun_agent_schema/src/`
   - `services/idun_agent_manager/src/`
   - `services/idun_agent_web/src/` (excluding `src/generated/`)
3. For each changed source file, check whether any file under the
   corresponding `tests/` directory was also changed in the same window.
   Match by module name, not just directory — `agent/langgraph.py` should
   pair with any `test_langgraph*.py`.
4. Categorize each gap:
   - **Likely real gap** — net new code (lines added > 30, no test touched).
   - **Possibly legitimate** — pure refactor, rename, type-only, or generated
     code path.
   - **Generated** — anything under `src/generated/` or marked with a
     `# generated` header. Skip.
5. Update the rolling issue with a table grouped by service:
   - File · lines added · last commit · author · category · suggested test
6. Highlight any file that has appeared in this report for 3+ consecutive
   weeks — those are real risks.

## Non-goals

- Do not write tests automatically. This is a reporting schedule only.
- Do not block PRs based on this report.
- Do not measure coverage percentage — this report is about *new* code, which
  coverage tools handle poorly week-over-week.
