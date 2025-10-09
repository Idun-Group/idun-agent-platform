# TestPyPI Setup Summary

## What's Been Implemented

A complete automated system for publishing test versions of both libraries to TestPyPI, with automatic dependency resolution between `idun-agent-schema` and `idun-agent-engine`.

## Files Created/Modified

### GitHub Workflows

1. **`.github/workflows/publish_schema_testpypi.yml`**
   - Publishes `idun-agent-schema` to TestPyPI
   - Triggers on changes to `libs/idun_agent_schema/`
   - Runs on all branches

2. **`.github/workflows/publish_engine_testpypi.yml`**
   - Publishes `idun-agent-engine` to TestPyPI
   - Triggers on changes to `libs/idun_agent_engine/`
   - **Also triggers when schema workflow completes**
   - Automatically detects and uses test schema versions
   - Includes 2-minute wait for TestPyPI availability

### Documentation

3. **`docs/testpypi-usage.md`**
   - User guide for installing test packages
   - Examples and troubleshooting

4. **`docs/testpypi-dependency-handling.md`**
   - Technical details on dependency resolution
   - Workflow execution order
   - Architecture diagrams
   - Troubleshooting guide

## How It Works

### Automatic Dependency Resolution

When you commit changes to **both** libraries:

```bash
# Make changes to both
vim libs/idun_agent_schema/src/...
vim libs/idun_agent_engine/src/...

# Commit and push
git add .
git commit -m "Update both schema and engine"
git push
```

**What happens automatically:**

1. ✅ Schema workflow runs and publishes `0.2.0.dev20251009143025` to TestPyPI
2. ✅ Schema workflow completes and triggers engine workflow
3. ✅ Engine workflow detects schema was modified in the same commit
4. ✅ Engine updates its dependency: `idun-agent-schema==0.2.0.dev20251009143025`
5. ✅ Engine waits for schema to be available on TestPyPI (up to 2 min)
6. ✅ Engine builds using the test schema version
7. ✅ Engine publishes to TestPyPI

**Result:** Both packages on TestPyPI with matching versions!

### Installing Test Versions

```bash
# Just install the engine - it will automatically install the correct schema!
pip install idun-agent-engine==0.1.0.dev20251009143025 \
  --index-url https://test.pypi.org/simple/ \
  --extra-index-url https://pypi.org/simple/

# Installed automatically:
# ✅ idun-agent-engine==0.1.0.dev20251009143025
# ✅ idun-agent-schema==0.2.0.dev20251009143025 (same timestamp!)
```

## Key Features

### 1. Smart Dependency Detection
- Engine workflow checks if schema was modified in the same commit
- Uses `git diff --name-only HEAD~1 HEAD` to detect changes
- Only updates dependency if schema was actually modified

### 2. Workflow Orchestration
- Engine workflow has TWO triggers:
  - Direct: Push to `libs/idun_agent_engine/`
  - Indirect: Schema workflow completion
- Ensures correct execution order
- Uses same commit SHA for both workflows

### 3. TestPyPI Availability Wait
- Waits up to 2 minutes for packages to be available
- Polls TestPyPI every 5 seconds
- Prevents race conditions

### 4. Version Synchronization
- Both libraries use same timestamp format: `X.Y.Z.dev<TIMESTAMP>`
- Calculated once, ensuring matching versions
- Timestamp ensures uniqueness and chronological ordering

## Testing Scenarios

### Scenario 1: Only Schema Changed ✅
```bash
# Modify only schema
vim libs/idun_agent_schema/src/...
git commit -am "Update schema"
git push
```

**Result:**
- Schema workflow publishes to TestPyPI
- Engine workflow ALSO runs (via workflow_run trigger)
- Engine detects schema change and publishes with new schema dependency

### Scenario 2: Only Engine Changed ✅
```bash
# Modify only engine
vim libs/idun_agent_engine/src/...
git commit -am "Update engine"
git push
```

**Result:**
- Engine workflow publishes to TestPyPI
- Uses stable schema from PyPI (not test version)

### Scenario 3: Both Changed ✅
```bash
# Modify both
vim libs/idun_agent_schema/src/...
vim libs/idun_agent_engine/src/...
git commit -am "Update both"
git push
```

**Result:**
- Schema publishes first
- Engine waits, then publishes with test schema dependency
- Perfect synchronization!

## Version Format

```
<base_version>.dev<timestamp>

Example: 0.2.0.dev20251009143025
         └──┬──┘    └────┬─────┘
        base version   timestamp
```

**Why no branch/commit in version?**
- PyPI/TestPyPI don't allow local version identifiers (`+branch.commit`)
- Branch and commit info are in GitHub Actions logs
- Timestamp alone ensures uniqueness

## Requirements Files

Example `requirements.txt`:
```txt
# Install engine (automatically gets matching schema)
idun-agent-engine==0.1.0.dev20251009143025

# Or install both explicitly
idun-agent-schema==0.2.0.dev20251009143025
idun-agent-engine==0.1.0.dev20251009143025
```

Install with:
```bash
pip install -r requirements.txt \
  --index-url https://test.pypi.org/simple/ \
  --extra-index-url https://pypi.org/simple/
```

## GitHub Secret Required

Ensure this secret exists in your GitHub repo:
- **Name:** `TEST_PYPI_API_TOKEN`
- **Value:** Your TestPyPI API token
- **Location:** Settings → Secrets and variables → Actions

## Monitoring

### Check Workflow Status
1. Go to **Actions** tab
2. Look for both workflows from the same commit
3. Verify schema completed before engine started

### Verify Versions
1. TestPyPI Schema: https://test.pypi.org/project/idun-agent-schema/
2. TestPyPI Engine: https://test.pypi.org/project/idun-agent-engine/

### Check Logs
Engine workflow logs will show:
```
Schema was modified. Will use test version: 0.2.0.dev20251009143025
Updating schema dependency to test version: 0.2.0.dev20251009143025
✓ Package found on TestPyPI!
Installing schema test version from TestPyPI...
Building with schema from TestPyPI...
```

## Architecture Summary

```
┌─────────────────────────────────────────────────┐
│         Commit with Schema + Engine Changes     │
└────────────────────┬────────────────────────────┘
                     │
                     ├──────────────────────┐
                     ▼                      ▼
        ┌────────────────────┐  ┌──────────────────────┐
        │ Schema Workflow    │  │ Engine Workflow      │
        │                    │  │ (waits for schema)   │
        └────────┬───────────┘  └──────────┬───────────┘
                 │                         │
                 ▼                         ▼
        Publish schema         Detect schema change
        to TestPyPI                       │
                 │                        ▼
                 │              Update engine dependency
                 │              to use test schema
                 │                        │
                 │                        ▼
                 │              Wait for schema on TestPyPI
                 │                        │
                 │                        ▼
                 │              Build with test schema
                 │                        │
                 │                        ▼
                 │              Publish engine to TestPyPI
                 │                        │
                 └────────────┬───────────┘
                              ▼
                    Both packages on TestPyPI
                    with synchronized versions!
```

## Next Steps

1. ✅ Workflows are ready to use
2. ✅ Make changes to either or both libraries
3. ✅ Commit and push to any branch
4. ✅ Check Actions tab to monitor publishing
5. ✅ Install test versions using the commands above

## Quick Reference

### Find Latest Test Version
```bash
pip index versions idun-agent-engine \
  --index-url https://test.pypi.org/simple/
```

### Install Latest Test Version
```bash
pip install idun-agent-engine \
  --index-url https://test.pypi.org/simple/ \
  --extra-index-url https://pypi.org/simple/
```

### Install Specific Test Version
```bash
pip install idun-agent-engine==0.1.0.dev20251009143025 \
  --index-url https://test.pypi.org/simple/ \
  --extra-index-url https://pypi.org/simple/
```

---

**🎉 You're all set!** The system is fully automated and will handle dependency resolution automatically for all your test deployments.
