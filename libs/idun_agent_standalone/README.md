# idun-agent-standalone

Self-sufficient Idun agent: one agent, one process, embedded chat UI + admin panel + traces viewer.

See `docs/superpowers/specs/2026-04-24-standalone-agent-mvp-design.md` for the full design and `docs/superpowers/plans/2026-04-24-standalone-agent-mvp.md` for the implementation plan.

## Quick start

```bash
pip install idun-agent-standalone
idun-standalone init my-agent
cd my-agent && idun-standalone serve
```

Chat: <http://localhost:8000/> · Admin: <http://localhost:8000/admin/>
