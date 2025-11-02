# Manual release (temporary; use uv)

# 1) publish schema

uv build --wheel --project libs/idun_agent_schema

uvx --from twine twine upload libs/idun_agent_schema/dist/*

# 2) publish engine (depends on schema)

uv build --wheel --project libs/idun_agent_engine

uvx --from twine twine upload libs/idun_agent_engine/dist/*

# 3) build manager image (consumes schema from PyPI)

docker build -f services/idun_agent_manager/Dockerfile -t ghcr.io/idun-group/manager:0.2.1 services/idun_agent_manager
