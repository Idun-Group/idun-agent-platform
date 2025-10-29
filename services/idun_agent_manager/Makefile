.PHONY: help serve migrate migrate-auto migrate-down migrate-history db-init clean-db

## Local (non-docker) commands
ENV := PYTHONPATH=./src
ALEMBIC := $(ENV) uv run alembic
PYTHON := $(ENV) uv run python
UVICORN := $(ENV) uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

## Database
migrate: ## Run database migrations (upgrade head)
	$(ALEMBIC) upgrade head

migrate-auto: ## Generate automatic migration (require: msg="your message")
	@if [ -z "$(msg)" ]; then echo "Usage: make migrate-auto msg=\"message\""; exit 1; fi
	$(ALEMBIC) revision --autogenerate -m "$(msg)"

migrate-down: ## Rollback last migration (-1)
	$(ALEMBIC) downgrade -1

migrate-history: ## Show migration history
	$(ALEMBIC) history

db-init: ## Initialize DB schema (migrate)
	$(ALEMBIC) upgrade head

## Development server (local)
serve: ## Start development server (hot reload)
	$(UVICORN)

clean-db: ## Reset database (WARNING: irreversible) -> downgrade base then upgrade head
	$(ALEMBIC) downgrade base || true
	$(ALEMBIC) upgrade head
