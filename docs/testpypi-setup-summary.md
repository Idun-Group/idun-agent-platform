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

**EVERY commit to ANY branch triggers BOTH workflows:**

```bash
# Make ANY changes (even just docs or README)
vim libs/idun_agent_schema/src/...
vim libs/idun_agent_engine/src/...
vim README.md

# Commit and push
git add .
git commit -m "Any changes"
git push
```

**What happens automatically:**

1. ✅ Schema workflow ALWAYS runs and publishes `0.2.0.dev20251009143025` to TestPyPI
2. ✅ Schema workflow completes and triggers engine workflow
3. ✅ Engine workflow queries TestPyPI for latest schema version
4. ✅ Engine finds `0.2.0.dev20251009143025` and updates its dependency
5. ✅ Engine builds using the test schema version from TestPyPI
6. ✅ Engine publishes to TestPyPI

**Result:** Both packages ALWAYS synchronized on TestPyPI!

**Why this is better:**
- No complex change detection logic
- Always fresh versions of both packages
- Engine always uses latest test schema
- Guaranteed synchronization on every commit

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

### 1. Always Publish Both
- **Schema workflow:** Triggers on EVERY commit to ANY branch
- **Engine workflow:** Triggers when schema completes successfully
- No path-based filtering - always build fresh versions

### 2. Automatic Schema Version Discovery
- Engine queries TestPyPI for latest schema version
- Uses exact version just published
- No timestamp synchronization needed

### 3. TestPyPI Availability Wait
- Waits up to 2 minutes for schema to be available
- Polls TestPyPI every 5 seconds
- Prevents race conditions

### 4. Simple & Reliable
- No complex change detection logic
- No git history requirements
- Just works on every commit
- Guaranteed synchronization

## Testing Scenarios

### Every Commit - Same Behavior ✅
```bash
# ANY changes to ANYTHING
vim libs/idun_agent_schema/src/...   # schema changes
vim libs/idun_agent_engine/src/...   # engine changes
vim README.md                        # or just docs
git commit -am "Any commit message"
git push
```

**Result - ALWAYS the same:**
1. ✅ Schema publishes to TestPyPI
2. ✅ Engine workflow automatically triggered
3. ✅ Engine queries for latest schema version
4. ✅ Engine publishes with that schema dependency
5. ✅ Perfect synchronization!

**No matter what you change, both packages are always published with the latest versions.**

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
