lint:
	poetry run ruff check . --no-cache

format:
	poetry run black .
	poetry run ruff format . --no-cache

mypy:
	poetry run mypy src

pytest:
	poetry run pytest

precommit:
	poetry run pre-commit run --all-files

ci:
	make lint
	make mypy
	make pytest

docs-install:
	poetry install --with dev

docs-serve:
	poetry run mkdocs serve -a localhost:8001

docs-build:
	poetry run mkdocs build --clean

docs-deploy:
	poetry run mkdocs gh-deploy --force
