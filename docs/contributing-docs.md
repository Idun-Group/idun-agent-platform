---
title: Contributing to Docs
---

# Contributing to the Documentation

We use MkDocs with the Material theme and mkdocstrings to auto-generate API docs.

## Quick start

```bash
poetry install --with dev
make docs-serve
```

Visit http://localhost:8001 to preview changes.

## Structure

- Top-level pages live under `docs/` and are linked in `mkdocs.yml` `nav`.
- API reference is generated from `libs/idun_agent_engine/src/idun_agent_engine/**` via `docs/gen_api_reference.py`.

## Authoring guidelines

- Prefer short sections and examples over long prose.
- Use fenced code blocks with language annotations.
- Link across pages using relative links and headings; `autorefs` resolves them.
- Keep repository `README.md` high-level; put detailed guides in `docs/`.

## Publishing

Docs are built on pushes to `main` and deployed to GitHub Pages automatically. To deploy manually:

```bash
make docs-deploy
```
