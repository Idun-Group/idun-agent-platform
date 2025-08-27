.PHONY: help install dev up down migrate test lint format clean

# Variables
# Check if we have compose v2 (docker compose) or v1 (docker-compose)
DOCKER_COMPOSE_V2 := $(shell docker compose version 2>/dev/null)
ifdef DOCKER_COMPOSE_V2
    COMPOSE := docker compose -f docker-compose.dev.yml
else
    COMPOSE := docker-compose -f docker-compose.dev.yml
endif
CLI_SERVICE := agent-manager-cli
DEV_SERVICE := agent-manager-dev

# Commands that run inside containers
POETRY := $(COMPOSE) exec $(CLI_SERVICE) poetry
ALEMBIC := $(COMPOSE) exec $(CLI_SERVICE) poetry run alembic
PYTEST := $(COMPOSE) exec $(CLI_SERVICE) poetry run pytest
RUFF := $(COMPOSE) exec $(CLI_SERVICE) poetry run ruff
BLACK := $(COMPOSE) exec $(CLI_SERVICE) poetry run black
MYPY := $(COMPOSE) exec $(CLI_SERVICE) poetry run mypy

# For commands that need the CLI container running
ENSURE_CLI := $(COMPOSE) up -d $(CLI_SERVICE)

help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies with Poetry (inside container)
	$(ENSURE_CLI)
	$(POETRY) install

dev: ## Install development dependencies (inside container) 
	$(ENSURE_CLI)
	$(POETRY) install --with dev

# Database commands
migrate: ## Run database migrations (inside container)
	$(ENSURE_CLI)
	$(ALEMBIC) upgrade head

migrate-auto: ## Generate automatic migration (inside container)
	$(ENSURE_CLI)
	$(ALEMBIC) revision --autogenerate -m "$(msg)"

migrate-manual: ## Create manual migration (inside container)
	$(ENSURE_CLI)
	$(ALEMBIC) revision -m "$(msg)"

migrate-down: ## Rollback last migration (inside container)
	$(ENSURE_CLI)
	$(ALEMBIC) downgrade -1

migrate-history: ## Show migration history (inside container)
	$(ENSURE_CLI)
	$(ALEMBIC) history

# Docker commands
up: ## Start development environment with Docker Compose
	$(COMPOSE) up -d

down: ## Stop development environment
	$(COMPOSE) down

logs: ## Show Docker logs
	$(COMPOSE) logs -f

logs-app: ## Show application logs only
	$(COMPOSE) logs -f $(DEV_SERVICE)

build: ## Build Docker images with Poetry lock file generation
	@echo "🔧 Building Docker images..."
	@if [ ! -f poetry.lock ]; then \
		echo "⚠️  poetry.lock not found - it will be generated during build"; \
	fi
	$(COMPOSE) build
	@echo "✅ Build completed successfully"

rebuild: ## Rebuild Docker images without cache
	@echo "🔧 Rebuilding Docker images from scratch..."
	$(COMPOSE) build --no-cache
	@echo "✅ Rebuild completed successfully"

# Development server
serve: ## Start development server (containerized with hot reload)
	$(COMPOSE) up -d $(DEV_SERVICE)
	@echo "🚀 Development server started at http://localhost:8000"
	@echo "📖 API docs available at http://localhost:8000/docs"

serve-logs: ## Start development server and follow logs
	$(COMPOSE) up $(DEV_SERVICE)

stop-serve: ## Stop development server
	$(COMPOSE) stop $(DEV_SERVICE)

restart-serve: ## Restart development server
	$(COMPOSE) restart $(DEV_SERVICE)

# Testing
test: ## Run tests (inside container)
	$(ENSURE_CLI)
	$(PYTEST)

test-cov: ## Run tests with coverage (inside container)
	$(ENSURE_CLI)
	$(PYTEST) --cov=app --cov-report=html --cov-report=term

test-unit: ## Run unit tests only (inside container)
	$(ENSURE_CLI)
	$(PYTEST) tests/unit/

test-integration: ## Run integration tests only (inside container)
	$(ENSURE_CLI)
	$(PYTEST) tests/integration/

# Code quality
lint: ## Run linting (inside container)
	$(ENSURE_CLI)
	$(RUFF) check .

lint-fix: ## Run linting with auto-fix (inside container)
	$(ENSURE_CLI)
	$(RUFF) check . --fix

format: ## Format code (inside container)
	$(ENSURE_CLI)
	$(BLACK) .
	$(RUFF) format .

format-check: ## Check if code is formatted (inside container)
	$(ENSURE_CLI)
	$(BLACK) . --check
	$(RUFF) format . --check

type-check: ## Run type checking (inside container)
	$(ENSURE_CLI)
	$(MYPY) src/

# Pre-commit hooks
precommit: ## Run pre-commit hooks on all files (inside container)
	$(ENSURE_CLI)
	$(COMPOSE) exec $(CLI_SERVICE) poetry run pre-commit run --all-files

precommit-install: ## Install pre-commit hooks (inside container)
	$(ENSURE_CLI)
	$(COMPOSE) exec $(CLI_SERVICE) poetry run pre-commit install

# Cleanup
clean: ## Clean up temporary files
	find . -type d -name "__pycache__" -delete
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type d -name ".pytest_cache" -delete
	find . -type d -name ".mypy_cache" -delete
	find . -type d -name ".ruff_cache" -delete

clean-db: ## Reset database (WARNING: This will delete all data)
	$(COMPOSE) down -v
	$(COMPOSE) up -d postgres redis
	@echo "Waiting for database to be ready..."
	@sleep 10
	$(ENSURE_CLI)
	$(ALEMBIC) upgrade head

# CI commands
ci: lint type-check test ## Run CI pipeline (lint, type-check, test)

# Container management
shell: ## Open a shell in the CLI container
	$(ENSURE_CLI)
	$(COMPOSE) exec $(CLI_SERVICE) /bin/bash

shell-dev: ## Open a shell in the development container  
	$(COMPOSE) exec $(DEV_SERVICE) /bin/bash

# Container inspection and debugging
ps: ## Show running containers
	$(COMPOSE) ps

top: ## Show container resource usage
	$(COMPOSE) top

stats: ## Show live container resource statistics  
	docker stats $$($(COMPOSE) ps -q)

inspect-logs: ## Inspect logs from all services
	$(COMPOSE) logs

restart: ## Restart all services
	$(COMPOSE) restart

# Development workflows
dev-full: ## Full development cycle: build, up, migrate, serve
	make build
	make up
	@echo "Waiting for services to be ready..."
	@sleep 10
	make migrate
	make serve
	@echo "🎉 Full development environment is ready!"

dev-reset: ## Complete reset: down, clean, rebuild, up
	make down
	make clean-db
	make rebuild
	make up
	@sleep 10
	make migrate
	@echo "🔄 Environment completely reset and ready!"

# Environment setup
setup: build up install precommit-install ## Setup development environment (containerized)
	@echo "🐳 Containerized development environment setup complete!"
	@echo "Run 'make serve' to start the development server"

# Quick start for new developers  
quickstart: setup migrate serve ## Complete setup and start everything
	@echo "🚀 Idun Agent Manager is ready!"
	@echo "API: http://localhost:8000"
	@echo "Docs: http://localhost:8000/docs"
	@echo "Run 'make shell' to access the container shell" 