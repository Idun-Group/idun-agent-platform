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

## Code of Conduct

By contributing to this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Questions?

If you have any questions, feel free to ask by opening an issue.
