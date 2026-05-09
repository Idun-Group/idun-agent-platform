# Contributing to Idun Agent Platform

First off, thank you for considering contributing to idun-agent-platform! It's people like you who make open source such a great community.

## Where do I go from here?

If you've noticed a bug or have a question, [search the issue tracker](https://github.com/Idun-Group/idun-agent-platform/issues) to see if someone else has already reported the issue. If not, feel free to [open a new issue](https://github.com/Idun-Group/idun-agent-platform/issues/new).

## Fork & create a branch

If you want to contribute code, please fork the repository and create a new branch from `main`. A good branch name would be `fix/my-fix` or `feat/my-feature`.

## Getting started

This repo requires **Python 3.12+**.

After cloning your fork, set up your local environment using `uv` (including dev tools like `pytest` and `pre-commit`):

```bash
uv sync --all-groups
```

This will install all the dependencies needed for development and testing.

## Making changes

- Write clean, maintainable code.
- Run the pre-commit checks:

```bash
make precommit
```

- Run the test suite:

```bash
make test
```

- Write clear and concise commit messages.
- Update the `README.md` and any other relevant documentation in the `/docs` folder if you are adding new features or changing existing ones.

## Submitting your contribution

Once your changes are complete, submit a pull request to the `main` branch of the original repository. Provide a clear description of the changes and why they are needed.

## Working on idun-agent-standalone

The `idun-agent-standalone` product spans Python (backend) and TypeScript (frontend) plus a wheel-packaged Next.js static export. Common loops:

Backend tests:

```bash
uv run pytest libs/idun_agent_standalone/tests -q
```

Frontend tests + build:

```bash
cd services/idun_agent_standalone_ui
pnpm install
pnpm typecheck && pnpm test && pnpm build
```

End-to-end (Playwright self-boots the standalone server):

```bash
cd services/idun_agent_standalone_ui
pnpm test:e2e
```

Wheel:

```bash
make build-standalone-ui
make build-standalone-wheel
# Smoke-test the wheel in a clean venv:
bash scripts/wheel-install-smoke.sh
```

Run a dev standalone against the echo agent:

```bash
cd services/idun_agent_standalone_ui
./e2e/boot-standalone.sh
# Visit http://127.0.0.1:8001
```

## Documentation

The repo includes per-package `CLAUDE.md` files that orient contributors (and AI tools) on the architecture, conventions, and current scope of each library and service. These are part of the public contract:

- If your PR adds, removes, or renames a public function or class, an HTTP route, a CLI command, an env var, a config field, a module, or a top-level directory — update the relevant `CLAUDE.md` in the same PR.
- Volatile blocks (route tables, env var lists, module trees) carry a `<!-- VERIFY: ... -->` HTML comment. Treat the comment as a checklist when editing the block.
- New top-level directories or services require a one-line entry in the root `CLAUDE.md`'s Repository Map.

Reviewers reject PRs where scope-changing code is not accompanied by a CLAUDE.md update.

## End-to-end test coverage for LLM-driven UI features

Any new UI feature that triggers an LLM-driven flow must:

1. **Add a Playwright spec** under `services/idun_agent_standalone_ui/e2e/` that exercises the feature end-to-end, with assertions tolerant of real-LLM output drift (substring or shape checks, never exact strings).
2. **Wire the spec into `.github/workflows/e2e-real-llm.yml`** if it needs a new agent fixture (under `tests/e2e/fixtures/agents/`) or YAML template (under `tests/e2e/fixtures/configs/`). For specs that only consume an existing fixture, no workflow change is needed — `playwright test` runs every spec in the directory.
3. **Run on the existing required-check pair (LG+OpenAI)** at minimum. Extend to other pairs (`lg-gemini`, `adk-gemini`) only when the feature has provider-specific behavior worth covering.

The pytest layer at `tests/e2e/` covers the engine-side surface; the Playwright layer covers the UI-streaming + real-browser path. Both must stay green to merge to `main` or `develop`.

See `tests/e2e/README.md` for the run-book and scenario-authoring guide.

## Code of Conduct

By contributing to this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Questions?

If you have any questions, feel free to ask by opening an issue.

<!-- BEGIN: generated-by render_guidelines -->
## Coding Guidelines (auto-generated)

This repository follows the Idun coding-guideline rule set (12 rules: 0 block / 11 warn / 1 advise).

Full reference: [`docs/team/CODING-GUIDELINES.md`](docs/team/CODING-GUIDELINES.md).

Active rule ids: ASYNC-001, ASYNC-002, CMP-001, ERR-001, LOG-001, LOG-003, MIGRATION-001, RES-001, SCHEMA-001, SQL-001, TIME-001, TYPE-001.
<!-- END: generated-by render_guidelines -->
