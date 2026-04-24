# idun-chat-web

Default chat UI served by `idun-agent-engine` at `/`. Next.js 14 (static export) + React 18 + Tailwind. Calls the engine's generic `/agent/run` and `/agent/capabilities`.

## Build

```bash
pnpm install
pnpm build
```

`pnpm build` produces two things:

- `./out/` — the Next.js static export. CI copies this into the Python wheel via `[tool.hatch.build.targets.wheel.force-include]`, so `pip install idun-agent-engine` ships the built UI.
- `../src/idun_agent_engine/_web/` — a staging copy so editable source installs (`pip install -e .`) also serve the UI without a `--ui-dir` flag. Gitignored; created by the `postbuild` script.

## Local dev against a running engine

```bash
pnpm dev  # starts Next.js on :3002, talks to a running engine
```

For engine-side testing of the mount, build once (`pnpm build`) and run:

```bash
idun agent serve --source file --path /path/to/config.yaml
```

The engine finds the staged `_web/` and serves it at `/`. Pass `--ui-dir PATH` to override with a different build.
