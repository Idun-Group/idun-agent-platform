# Release Smoke Checklist — idun-agent-standalone

Run before cutting a PyPI / GHCR release.

## Backend

- [ ] `make ci` (lint + mypy + pytest) green
- [ ] `uv run pytest libs/idun_agent_standalone/tests -q` ≥ 110 passed
- [ ] `uv run pytest libs/idun_agent_engine/tests -q` green (or expected skips for langfuse / phoenix / postgres)

## Frontend

- [ ] `cd services/idun_agent_standalone_ui && pnpm typecheck && pnpm test && pnpm build` clean
- [ ] `pnpm test:e2e` 14/14

## Packaging

- [ ] `make build-standalone-ui` produces `out/` and copies into `static/`
- [ ] `make build-standalone-wheel` produces `dist/idun_agent_standalone-*.whl`
- [ ] `bash scripts/wheel-install-smoke.sh` PASS (clean venv install + `/health` 200)
- [ ] `unzip -l dist/idun_agent_standalone-*.whl` shows `alembic.ini` + `db/migrations/` + `static/index.html`

## Manual smoke

- [ ] Boot standalone, hit `/health` → 200
- [ ] Visit `/`, send "hello" → see `echo: hello` reply
- [ ] Click `+ New` → chat clears
- [ ] Visit `/admin/`, change agent name, save → reload succeeds
- [ ] Visit `/traces/` → recent session is listed
- [ ] Cmd-K (admin) → palette opens
- [ ] Theme toggle (admin) → dark class flips on `<html>`
- [ ] Mobile viewport (375 × 812) → composer reachable, hamburger opens history Sheet

## Docker

- [ ] `docker build -f libs/idun_agent_standalone/docker/Dockerfile.base -t idun-standalone:smoke .` builds clean
- [ ] `docker run --rm -p 8001:8000 idun-standalone:smoke` boots; `/health` → 200

## Sign-off

- [ ] All green → tag, push tag, GHCR + PyPI release workflow runs
