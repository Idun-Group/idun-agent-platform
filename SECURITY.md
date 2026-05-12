# Security Policy

## Reporting a vulnerability

If you believe you have found a security vulnerability in `idun-agent-platform`,
the `idun-agent-engine` SDK, or any related Idun-published package
(`idun-agent-schema`, `idun-agent-standalone`), **please report it privately**.

- **Preferred:** open a private report via
  [GitHub Security Advisories](https://github.com/Idun-Group/idun-agent-platform/security/advisories/new).
  This keeps the details confidential until a fix ships.
- **Fallback:** email `contact@idun-group.com` with a description of the issue,
  steps to reproduce, and any relevant logs or screenshots.

**Please do not** open a public GitHub issue, discussion, or PR that
describes an unpatched vulnerability.

When you report, please include:

- A clear description of the issue and potential impact.
- Steps to reproduce (proof-of-concept if possible).
- Affected component(s): Engine SDK / Standalone runtime / Schema / Web UI / CLI.
- The version(s) of `idun-agent-engine` / `idun-agent-schema` you are running
  (`pip show idun-agent-engine`), and the Python version.
- Any relevant logs, stack traces, or screenshots.

## Response commitments

- **Acknowledge** your report within **2 business days**.
- **Triage and assess** severity within **5 business days**.
- **Ship a fix** within **7 days** for critical vulnerabilities (CVSS ≥ 9.0)
  and within **30 days** for high-severity issues (CVSS 7.0–8.9), assuming
  the report contains enough detail to reproduce.
- **Coordinate disclosure** with the reporter before any public announcement.
  Embargo windows are negotiable for complex issues.

## What counts as a security issue

The following are explicitly in scope:

- **Supply-chain attacks** — compromised dependencies, typosquatting, malicious
  packages in our published wheel's transitive tree, or hijacked GitHub Actions
  used by our CI.
- **Credential exposure** — API keys, OIDC tokens, or session secrets leaked
  through logs, error responses, telemetry, traces, or build artifacts.
- **Remote code execution (RCE)** — any path that lets an attacker execute
  arbitrary code on a host running the engine, the standalone runtime, or
  the bundled admin UI.
- **Sandbox / isolation escape** — bypassing guardrails or the agent boundary
  to access the host filesystem, network, or environment variables that the
  agent was not configured to reach.
- **Authentication / authorization bypass** — circumventing the OIDC validator,
  basic-auth gate, or session middleware on `/agent/*` and `/admin/*` routes.
- **Injection** — prompt injection paths that bypass configured guardrails,
  SQL injection via the admin REST surface, or YAML/Jinja injection in the
  configuration loader.
- **DoS through resource exhaustion** when triggerable by a single
  unauthenticated request (e.g. an unbounded LLM call from an open endpoint).

Out of scope (please file a regular issue instead):

- Findings on dependencies' own websites or docs.
- Theoretical risks without a demonstrated impact path.
- Best-practice deviations that don't have an exploit path
  (e.g. "you should add HSTS" with no concrete attack scenario).
- Vulnerabilities in user-provided agent code or third-party agents loaded
  via `graph_definition` — those are the operator's responsibility.

## Supported versions

Security fixes are applied to:

- The **latest released minor** of `idun-agent-engine` and
  `idun-agent-schema` on PyPI.
- The current `main` branch.

Older versions receive fixes on a best-effort basis when the upgrade path
is non-trivial. Pre-release / `dev*` versions published to TestPyPI are not
covered.

## Why this policy exists

LLM tooling sits in the critical path between user input and model output.
Recent supply-chain incidents in adjacent projects
(notably the LiteLLM 1.82.7/1.82.8 compromise via a hijacked GitHub Action)
have shown that dependency integrity is a non-negotiable part of shipping
agent infrastructure. We treat supply-chain hardening and credential hygiene
as first-class concerns and welcome reports that strengthen them.

## Credit

Reporters who follow responsible disclosure will be credited by name (or handle)
in the resulting GitHub Security Advisory and the CHANGELOG entry for the fix
release, unless they prefer to remain anonymous.

## Related operational docs

- [`SECURITY-INCIDENT-RESPONSE.md`](SECURITY-INCIDENT-RESPONSE.md) —
  contributor-facing runbook for rotating publish tokens, revoking compromised
  credentials, and recovering from a supply-chain incident.
