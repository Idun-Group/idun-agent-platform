# Security Incident Response

Operational runbook for rotating credentials and recovering from a supply-chain
or credential-exposure incident in `idun-agent-platform`. Intended for
maintainers with admin access to the GitHub org, PyPI, and TestPyPI.

For *reporting* a vulnerability, see [`SECURITY.md`](SECURITY.md). This document
covers what we do after a report comes in or after a compromise is detected.

## Inventory of long-lived secrets

These are the secrets and tokens whose compromise would let an attacker
publish malicious packages, leak user data, or impersonate the build system.
Every entry must have an owner and a rotation procedure.

| Secret | Used by | Storage | Rotation owner |
| --- | --- | --- | --- |
| `TEST_PYPI_API_TOKEN` | `.github/workflows/publish_engine_testpypi.yml`, `publish_schema_testpypi.yml` | GitHub Actions org secret | Maintainers |
| PyPI **trusted publisher** (OIDC) | `.github/workflows/release.yml` | TestPyPI/PyPI project settings (no token; OIDC config only) | Maintainers |
| `GUARDRAILS_API_KEY` | `ci.yml`, `e2e-real-llm.yml`, `standalone-ci.yml` | GitHub Actions secret | Maintainers + Guardrails AI |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | `ci.yml` test job | GitHub Actions secret | Maintainers |
| `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY` | `e2e-real-llm.yml` | GitHub Actions secret | Maintainers |
| `IDUN_DEV_READ_TOKEN` | `ci.yml` guidelines-check job | GitHub Actions secret | Maintainers |
| `ANTHROPIC_API_KEY` | `ci.yml` guidelines-review job | GitHub Actions secret | Maintainers |
| `CODECOV_TOKEN` | (if/when re-enabled) | GitHub Actions secret | Maintainers |

GitHub Actions `GITHUB_TOKEN` is not listed — it is scoped per-workflow by
GitHub and revoked automatically at job end. Workflows that need extra
permissions request them explicitly via `permissions:` blocks.

## Severity tiers

| Tier | Trigger | Time to act |
| --- | --- | --- |
| **P0 — Active compromise** | Confirmed malicious package on (Test)PyPI, leaked publish token in public logs, attacker-controlled commit on `main`/`develop`, compromised maintainer account | Within 1 hour |
| **P1 — Credible threat** | Secret exposed in a private log/screenshot, suspected hijack of a pinned action, credentials shared in plaintext | Within 4 hours |
| **P2 — Hygiene** | Routine rotation, expiring token, contributor offboarding | Within 30 days |

## P0 / P1 response (in order)

### Step 1 — Halt the bleed

1. **Disable the affected workflow.** GitHub → repo → Actions → select workflow
   → ⋯ → *Disable workflow*. Do this before rotating, so a hijacked secret
   can't be re-used by an in-flight run.
2. **Cancel running workflow runs.** Actions tab → cancel anything in progress
   that uses the secret. Confirm `Wait for pending jobs to complete` is *not*
   selected.
3. **Yank malicious releases.** If a compromised version was already published
   to PyPI: `pip index versions idun-agent-engine` to confirm, then file an
   [admin removal request](https://pypi.org/help/#admin-removal) via the PyPI
   security contact. PyPI does not allow self-service deletion of a published
   version, but maintainers can mark it yanked from the project page (Manage →
   Releases → Yank). Yanking does not remove the artifact but prevents new
   `pip install` resolutions from picking it.

### Step 2 — Rotate the credential

Rotate in this exact order: revoke first, then mint, then update the secret store.

| Credential | Revoke | Mint replacement | Update secret store |
| --- | --- | --- | --- |
| `TEST_PYPI_API_TOKEN` | TestPyPI → Account settings → API tokens → *Remove* | TestPyPI → API tokens → *Add API token* (scope: project) | GitHub → repo Settings → Secrets and variables → Actions → edit `TEST_PYPI_API_TOKEN` |
| PyPI trusted publisher (OIDC) | PyPI project → Settings → Publishing → *remove* the GitHub workflow entry | Re-add the workflow entry under the **new** workflow filename / job environment | No secret to update — OIDC handshake is handled at action runtime |
| `GUARDRAILS_API_KEY` | Guardrails AI dashboard → *Revoke key* | Same dashboard → *New key* | GitHub Actions secret |
| Langfuse keys | Langfuse → Settings → API keys → *Delete* | Same panel → *Create key* | GitHub Actions secret |
| Model provider keys (OpenAI, Google, Anthropic, Gemini) | Each provider's console → revoke | Same console → mint new key | GitHub Actions secret |
| `IDUN_DEV_READ_TOKEN` | `idun-dev` repo Settings → tokens → revoke | Same → mint new (scope: `read:contents`) | GitHub Actions secret |

When a publish token has been used to push a malicious package, **also**
rotate the maintainer account password for the affected registry, enable a
hardware second factor if not already on, and audit the account's session
history.

### Step 3 — Investigate scope

1. Pull workflow run logs (GitHub UI, *Re-run* dropdown → *View raw logs*)
   and check for `Set up env` / `Print env` debug output that may have
   echoed the secret.
2. List recent runs that used the credential:
   `gh run list --workflow=publish_engine_testpypi.yml --limit 50 --json conclusion,createdAt,headSha`.
   Any successful run between the compromise window and the rotation timestamp
   is a candidate for forensics.
3. If a third-party GitHub Action was the entry point (the LiteLLM pattern):
   - Confirm the SHA pin in our workflow against the action's release page
     and Git history. A mismatched tag → SHA mapping means the tag was
     rewritten upstream.
   - Open an issue on the action's repo if confirmed.
   - File a GitHub Support ticket if the action was distributed via the
     Marketplace.

### Step 4 — Re-enable

1. Confirm the rotated secret in a dry-run job before re-enabling production
   publish workflows. The `--dry-run` flag on `uv publish` validates the
   token without uploading.
2. Re-enable the workflow.
3. Tag a deliberate test release on TestPyPI to confirm the pipeline is green.

### Step 5 — Communicate

1. Open a **GitHub Security Advisory** describing the incident, affected
   versions, and the fix release. Use the `idun-agent-platform` repo for
   advisories that span multiple published packages.
2. Notify users via the changelog and (if downstream impact) a Discord/Slack
   announcement.
3. If a published wheel was malicious, contact PyPI security
   (security@pypi.org) so they can flag the file in the index.
4. Credit the reporter in the advisory if they consented (see SECURITY.md).

### Step 6 — Post-incident review

Write a brief post-mortem in `docs/adr/` (or wherever the team consolidates
operational decisions) covering:

- Timeline of detection → containment → rotation → re-enable.
- Root cause (where did the credential leak, or which upstream got
  compromised).
- What detection signal we relied on and what would have caught it sooner.
- Concrete follow-ups (e.g. add a check, pin a SHA, narrow a token scope).

## P2 — Routine rotation

Rotate every 90 days, or sooner if a maintainer with access leaves the team.
Follow Step 2 above without the urgency of the rest of the runbook.

A rotation log entry should be appended below.

## Detection signals

These are the signals we monitor to catch compromises early:

- **GitHub Dependabot alerts** — `.github/dependabot.yml` configures weekly
  scans of `pip`, `npm`, and `github-actions`. Critical alerts page the
  maintainers.
- **Socket Security org-side scanning** — full scans of every repo branch,
  with policy gating at `error` level. Webhook configured to surface
  newly-published packages with malware indicators in our dependency tree.
- **`security-audit` CI job** — `pip-audit` + `pnpm audit` run on every PR
  (`.github/workflows/ci.yml`). Currently advisory; will be ratcheted to
  blocking after a stabilization period.
- **Gitleaks pre-commit hook** — scans for accidentally committed secrets in
  the local working tree. Configured in `.pre-commit-config.yaml`.
- **GitHub Actions audit log** — Settings → Audit log; filter
  `action:workflows.disable` and `action:secrets.update` for unexpected entries.

## When in doubt

Treat a suspicious event as P1 until you have evidence otherwise. The cost of
rotating a credential and re-running CI is hours; the cost of letting a
compromised token live is unbounded.

## Rotation log

| Date | Credential | Reason | Operator |
| --- | --- | --- | --- |
| _initial_ | — | runbook created | maintainers |
