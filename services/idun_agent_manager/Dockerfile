FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=random \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /repo/services/idun_agent_manager

COPY libs/idun_agent_schema /repo/libs/idun_agent_schema
COPY services/idun_agent_manager/pyproject.toml ./
COPY services/idun_agent_manager/uv.lock* ./

RUN uv sync --no-dev

FROM python:3.13-slim AS production
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/repo/services/idun_agent_manager/src

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /repo/services/idun_agent_manager

COPY --from=base /repo/services/idun_agent_manager/.venv ./.venv
COPY --from=base /repo/libs/idun_agent_schema /repo/libs/idun_agent_schema

COPY services/idun_agent_manager/src/ ./src/
COPY services/idun_agent_manager/alembic.ini ./
COPY services/idun_agent_manager/alembic/ ./alembic/

RUN chown -R appuser:appuser /repo

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/healthz || exit 1

CMD ["./.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
