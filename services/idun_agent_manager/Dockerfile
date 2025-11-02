# Production-grade Dockerfile for Idun Agent Manager (FastAPI)
# - Multi-stage build using uv (https://docs.astral.sh/uv/)
# - Reproducible installs from uv.lock
# - Non-root runtime, minimal base
# - Cloud Run ready (listens on $PORT, default 8080)

FROM python:3.13-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps for building wheels for some libs (e.g., psycopg)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install uv (fast Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Copy lock and manifest first for better caching
COPY pyproject.toml /app/pyproject.toml
# Copy uv.lock if present for reproducible builds
COPY uv.lock /app/uv.lock

# Create virtualenv and install only runtime deps
RUN uv sync --frozen --no-dev \
    && uv pip install --python /app/.venv/bin/python "idun-agent-schema==0.2.1"


FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app/src

# Install minimal runtime libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /app/.venv /app/.venv

# Copy application code
COPY src/ /app/src/
COPY alembic.ini /app/alembic.ini
COPY alembic/ /app/alembic/

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser && \
    chown -R appuser:appuser /app
USER appuser

# Default Cloud Run port
EXPOSE 8080

# Optional container-level health check (Cloud Run also manages health)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8080}/api/v1/healthz" || exit 1

# Start with Gunicorn + Uvicorn workers; respect Cloud Run $PORT and configurable workers
CMD ["sh", "-lc", "gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w ${WORKERS:-2} -b 0.0.0.0:${PORT:-8080} --access-logfile - --error-logfile -"]
