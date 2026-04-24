# idun-chat-web

Default chat UI served by `idun-agent-engine` at `/`. Next.js 14 (static export) + React 18 + Tailwind. Calls the engine's generic `/agent/run` and `/agent/capabilities`.

## Build

```bash
pnpm install
pnpm build
```

Output lands in `./out/`. CI copies this directory into the Python wheel (see `pyproject.toml`'s `[tool.hatch.build.targets.wheel.force-include]`), so `pip install idun-agent-engine` ships the built UI.

## Local dev against a running engine

```bash
pnpm dev  # starts Next.js on :3002
# point it at a running engine by setting the agent URL in the UI or env
```

For manual engine-side testing of the static mount, build once (`pnpm build`) and run:

```bash
idun agent serve --source file --path /path/to/config.yaml --ui-dir libs/idun_agent_engine/web/out
```

`--ui-dir` overrides the bundled default.
