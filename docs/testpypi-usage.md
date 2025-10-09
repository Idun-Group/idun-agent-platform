# TestPyPI Usage Guide

This document explains how to use the test versions of the Idun Agent libraries published to TestPyPI.

> **🔗 Related**: See [TestPyPI Dependency Handling](testpypi-dependency-handling.md) for details on how dependencies between schema and engine are managed automatically.

## Overview

We automatically publish test versions of **both libraries** to TestPyPI for **every commit** to any branch. This ensures both packages are always in sync and allows you to test features before they're released to production PyPI.

**Key Point:** Every commit triggers both workflows, so you always get fresh, synchronized versions of both packages!

## How It Works

### Automatic Publishing

The following GitHub Actions workflows automatically publish to TestPyPI on **EVERY commit**:

- **`publish_schema_testpypi.yml`**: ALWAYS publishes `idun-agent-schema` (runs first)
- **`publish_engine_testpypi.yml`**: ALWAYS publishes `idun-agent-engine` (runs after schema completes)

Both workflows trigger on every push to any branch, ensuring both packages are always synchronized.

### Version Naming

Test versions follow this pattern:
```
<base_version>.dev<timestamp>
```

For example:
- Base version: `0.2.0`
- Published as: `0.2.0.dev20251009143025`

**Note on Branch and Commit Information:**
- PyPI/TestPyPI don't allow local version identifiers (the `+branch.commit` suffix)
- The version itself only contains the timestamp for uniqueness
- Branch name and commit SHA are displayed in the GitHub Actions logs
- You can find this information by checking the workflow run details

This ensures:
- Each commit gets a unique, chronologically sortable version
- Full PEP 440 compliance for PyPI/TestPyPI
- Versions are clean and easy to use
- Branch and commit info are available in CI logs for traceability

## Installing from TestPyPI

### Install idun-agent-schema from TestPyPI

```bash
# Install the latest test version
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ idun-agent-schema

# Install a specific test version
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ idun-agent-schema==0.2.0.dev20251009143025
```

### Install idun-agent-engine from TestPyPI

```bash
# Install the latest test version
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ idun-agent-engine

# Install a specific test version
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ idun-agent-engine==0.1.0.dev20251009143025
```

### Using uv

```bash
# Install schema from TestPyPI
uv pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ idun-agent-schema

# Install engine from TestPyPI
uv pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ idun-agent-engine
```

## Finding Available Test Versions

1. Visit TestPyPI directly:
   - Schema: https://test.pypi.org/project/idun-agent-schema/
   - Engine: https://test.pypi.org/project/idun-agent-engine/

2. Or check the GitHub Actions runs:
   - Go to the Actions tab in the repository
   - Look for successful "Publish to TestPyPI" workflow runs
   - Check the logs for the published version number, branch name, and commit SHA

## Important Notes

### --extra-index-url Flag

The `--extra-index-url https://pypi.org/simple/` flag is **required** because:
- TestPyPI only contains your test packages
- Dependencies (like `pydantic`, `fastapi`, etc.) are on production PyPI
- This flag tells pip/uv to check both TestPyPI and PyPI

### Dependencies Between Libraries

The engine depends on the schema package. **This is handled automatically!**

On EVERY commit (regardless of what changed):
1. Schema is published to TestPyPI first
2. Engine workflow automatically triggers
3. Engine queries TestPyPI for the latest schema version
4. Engine updates its dependency to use that exact version
5. Engine is built with the latest test schema

**Result:** The engine test package will ALWAYS require the latest test schema version!

```bash
# Just install the engine - it will pull the correct schema version
pip install idun-agent-engine==0.1.0.dev20251009143025 \
  --index-url https://test.pypi.org/simple/ \
  --extra-index-url https://pypi.org/simple/

# This automatically installs:
# - idun-agent-engine==0.1.0.dev20251009143025
# - idun-agent-schema==0.2.0.dev20251009143025 (same timestamp!)
```

For details, see [TestPyPI Dependency Handling](testpypi-dependency-handling.md).

### Limitations

- TestPyPI has a size limit and may periodically clean up old packages
- Test versions should not be used in production
- Each push creates a new version - old test versions may become unavailable

## Testing a Feature Branch

1. Create your feature branch and make changes
2. Commit and push your changes
3. GitHub Actions will automatically publish to TestPyPI
4. Check the Actions tab for the published version
5. Install and test the version from TestPyPI

Example workflow:
```bash
# 1. Create feature branch
git checkout -b feature/my-new-feature

# 2. Make changes to libs/idun_agent_schema/

# 3. Commit and push
git add .
git commit -m "Add new feature"
git push origin feature/my-new-feature

# 4. Wait for GitHub Actions to complete (check Actions tab)

# 5. Install the test version (check Actions logs for exact version, branch, and commit)
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ \
  idun-agent-schema==0.2.0.dev20251009143025

# 6. Test your changes
python -c "from idun_agent_schema import ..."
```

## Troubleshooting

### "Could not find a version that satisfies the requirement"

Make sure you're using both index URLs:
```bash
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ <package>
```

### Dependencies fail to install

Some dependencies might not be on TestPyPI. The `--extra-index-url` should handle this, but if you still have issues, you can install dependencies first from PyPI:
```bash
pip install pydantic fastapi  # Install deps from PyPI first
pip install --index-url https://test.pypi.org/simple/ idun-agent-schema  # Then install from TestPyPI
```

### Wrong version installed

Specify the exact version:
```bash
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ \
  idun-agent-schema==<exact-version>
```
