# TestPyPI Usage Guide

This document explains how to use the test versions of the Idun Agent libraries published to TestPyPI.

## Overview

We automatically publish test versions of both libraries to TestPyPI for every commit that modifies the library code. This allows you to test features before they're released to production PyPI.

## How It Works

### Automatic Publishing

The following GitHub Actions workflows automatically publish to TestPyPI:

- **`publish_schema_testpypi.yml`**: Publishes `idun-agent-schema` when changes are made to `libs/idun_agent_schema/`
- **`publish_engine_testpypi.yml`**: Publishes `idun-agent-engine` when changes are made to `libs/idun_agent_engine/`

### Version Naming

Test versions follow this pattern:
```
<base_version>.dev<timestamp>+<commit_hash>
```

For example:
- Base version: `0.2.0`
- Published as: `0.2.0.dev20251009143025+a1b2c3d`

This ensures:
- Each commit gets a unique version
- Versions are sortable chronologically
- You can trace back to the specific commit

## Installing from TestPyPI

### Install idun-agent-schema from TestPyPI

```bash
# Install the latest test version
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ idun-agent-schema

# Install a specific test version
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ idun-agent-schema==0.2.0.dev20251009143025+a1b2c3d
```

### Install idun-agent-engine from TestPyPI

```bash
# Install the latest test version
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ idun-agent-engine

# Install a specific test version
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ idun-agent-engine==0.1.0.dev20251009143025+a1b2c3d
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
   - Check the logs for the published version number

## Important Notes

### --extra-index-url Flag

The `--extra-index-url https://pypi.org/simple/` flag is **required** because:
- TestPyPI only contains your test packages
- Dependencies (like `pydantic`, `fastapi`, etc.) are on production PyPI
- This flag tells pip/uv to check both TestPyPI and PyPI

### Dependencies Between Libraries

If `idun-agent-engine` depends on `idun-agent-schema`, you may need to:

1. Install both from TestPyPI if testing changes in both:
```bash
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ \
  idun-agent-schema==<test-version> \
  idun-agent-engine==<test-version>
```

2. Or install one from TestPyPI and one from PyPI:
```bash
# Test schema with stable engine
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ \
  idun-agent-schema==<test-version>
pip install idun-agent-engine
```

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

# 5. Install the test version (check logs for exact version)
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ \
  idun-agent-schema==0.2.0.dev20251009143025+a1b2c3d

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
