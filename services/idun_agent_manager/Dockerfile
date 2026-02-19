# Production-grade Dockerfile for Idun Agent Manager (FastAPI)
# Multi-stage build:
#   1. Builder: Install dependencies with uv
#   2. Runtime: Minimal image with non-root user, health checks, auto-migrations
# Best practices: reproducible builds, security hardening, cloud-ready

# ============================================================================
# Stage 1: Builder - Install dependencies
# ============================================================================
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UV_PYTHON_DOWNLOADS=never

# Install build dependencies
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

# Copy dependency files for fresh install
COPY pyproject.toml ./
# Reproducible build (commented out for fresh installs):
# COPY uv.lock* ./

# Install runtime dependencies into virtual environment
# --no-dev: skip development dependencies
# Reproducible build flag (commented out for fresh installs):
# --frozen: use exact versions from lockfile
RUN uv sync --no-dev --python 3.12

# ============================================================================
# Stage 2: Runtime - Minimal production image
# ============================================================================
FROM python:3.12-slim AS runtime

# Metadata
LABEL maintainer="Idun Group <contact@idun-group.com>" \
      description="Idun Agent Manager - FastAPI service for managing AI agents" \
      version="0.4.3"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app/src \
    # Default values (can be overridden)
    PORT=8080 \
    WORKERS=2

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

# Create non-root user for security
RUN groupadd -r appuser --gid 1000 && \
    useradd -r -g appuser --uid 1000 --home-dir /app --shell /bin/bash appuser && \
    chown -R appuser:appuser /app

USER appuser

# Expose default port
EXPOSE 8000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/api/v1/healthz" || exit 1

# Startup script with optional auto-migration
CMD ["sh", "-c", "\
    echo '=== Starting Gunicorn with Uvicorn workers ===' && \
    exec gunicorn app.main:app \
        -k uvicorn.workers.UvicornWorker \
        -w ${WORKERS} \
        -b 0.0.0.0:${PORT} \
        --access-logfile - \
        --error-logfile - \
        --log-level info \
        --timeout 120 \
        --graceful-timeout 30 \
        --keep-alive 5 \
"]
