# TestPyPI Dependency Handling

This document explains how the TestPyPI publishing workflows handle dependencies between `idun-agent-schema` and `idun-agent-engine`.

## The Challenge

`idun-agent-engine` depends on `idun-agent-schema`. When testing changes across both libraries in the same commit, we need to ensure:

1. The test version of `idun-agent-schema` is published to TestPyPI FIRST
2. The test version of `idun-agent-engine` uses the SAME test version of the schema
3. Both packages are built from the same commit

## How It Works

### Workflow Execution Order

1. **Schema Workflow Runs First** (`publish_schema_testpypi.yml`)
   - Triggers when `libs/idun_agent_schema/` is modified
   - Publishes `idun-agent-schema==0.2.0.devTIMESTAMP` to TestPyPI

2. **Engine Workflow Runs After** (`publish_engine_testpypi.yml`)
   - Has TWO triggers:
     - Direct: When `libs/idun_agent_engine/` is modified
     - Indirect: When schema workflow completes successfully
   - Checks if schema was modified in the same commit
   - If yes: Updates dependency to use the test version from TestPyPI
   - If no: Uses stable schema from PyPI

### Automatic Dependency Resolution

The engine workflow automatically:

1. **Detects Schema Changes**
   ```bash
   git diff --name-only HEAD~1 HEAD | grep "^libs/idun_agent_schema/"
   ```

2. **Finds the Actual Schema Version**
   - Queries TestPyPI for the latest dev version just published
   - Uses the exact version that was published (matching timestamp!)
   - Fallback: Calculates with current timestamp if query fails

3. **Updates pyproject.toml**
   ```toml
   # Before:
   "idun-agent-schema>=0.2.0,<0.3.0"

   # After (if schema modified):
   "idun-agent-schema==0.2.0.dev20251009143025"
   ```

4. **Waits for TestPyPI Availability**
   - Polls TestPyPI for up to 2 minutes
   - Ensures package is available before building

5. **Builds with Correct Dependencies**
   - Uses TestPyPI index if schema was modified
   - Uses PyPI index otherwise

## Usage Scenarios

### Scenario 1: Only Schema Changed
```bash
# Modify only schema
vim libs/idun_agent_schema/src/...
git commit -am "Update schema"
git push
```

**Result:**
- ✅ Schema workflow publishes `idun-agent-schema==0.2.0.devTIMESTAMP`
- ✅ Engine workflow also runs (via workflow_run trigger)
- ✅ Engine uses the NEW test schema version
- ✅ Both are synchronized

### Scenario 2: Only Engine Changed
```bash
# Modify only engine
vim libs/idun_agent_engine/src/...
git commit -am "Update engine"
git push
```

**Result:**
- ✅ Engine workflow publishes using stable schema from PyPI
- ℹ️ Schema workflow doesn't run

### Scenario 3: Both Changed (Most Common)
```bash
# Modify both libs
vim libs/idun_agent_schema/src/...
vim libs/idun_agent_engine/src/...
git commit -am "Update both schema and engine"
git push
```

**Result:**
- ✅ Schema workflow runs and publishes test version
- ✅ Engine workflow waits and then runs
- ✅ Engine detects schema change
- ✅ Engine updates dependency to use test schema version
- ✅ Engine builds with the correct test schema
- ✅ Both published with matching versions

## Installation Examples

### Install Both Test Versions

After pushing changes to both libs:

```bash
# Both packages will use the same timestamp (from same commit)
pip install \
  idun-agent-schema==0.2.0.dev20251009143025 \
  idun-agent-engine==0.1.0.dev20251009143025 \
  --index-url https://test.pypi.org/simple/ \
  --extra-index-url https://pypi.org/simple/
```

The engine package will automatically require the correct schema version!

### Verify Dependencies

```bash
# Install engine test version
pip install idun-agent-engine==0.1.0.dev20251009143025 \
  --index-url https://test.pypi.org/simple/ \
  --extra-index-url https://pypi.org/simple/

# Check what schema version was installed
pip show idun-agent-schema
# Should show: Version: 0.2.0.dev20251009143025 (same timestamp!)
```

## Workflow Triggers Explained

### Schema Workflow (`publish_schema_testpypi.yml`)
```yaml
on:
  push:
    branches:
      - '**'
    paths:
      - 'libs/idun_agent_schema/**'
```
- Runs when schema code changes
- Publishes to TestPyPI
- Triggers engine workflow upon completion

### Engine Workflow (`publish_engine_testpypi.yml`)
```yaml
on:
  push:
    branches:
      - '**'
    paths:
      - 'libs/idun_agent_engine/**'
  workflow_run:
    workflows: ["Publish idun-agent-schema to TestPyPI"]
    types:
      - completed
```
- Runs when engine code changes (direct trigger)
- Runs when schema workflow completes (indirect trigger)
- Automatically handles dependencies

## Troubleshooting

### Engine Build Fails: "Could not find schema version"

**Problem:** Schema might not be available on TestPyPI yet.

**Solution:** The workflow includes a 2-minute wait mechanism. If it still fails:
1. Check if schema workflow succeeded
2. Verify schema version on https://test.pypi.org/project/idun-agent-schema/
3. Re-run the engine workflow

### Wrong Schema Version Used

**Problem:** Engine uses stable schema instead of test version.

**Solution:**
1. Ensure both libs were modified in the SAME commit
2. Check workflow logs to see if schema change was detected
3. Verify `git diff HEAD~1 HEAD` includes schema changes

### Timestamp Mismatch

**Problem:** Schema and engine have different timestamps.

**Solution:** This can happen if:
- Workflows ran at different times (seconds apart)
- This is normal and won't cause issues
- The engine will still depend on the correct schema version

## Best Practices

1. **Commit Both Together**: When changing both libs, commit in a single commit
2. **Wait for Workflows**: Let schema workflow complete before manually triggering engine
3. **Check Logs**: Always verify in workflow logs which versions are being used
4. **Test Installation**: After both publish, test installing the engine alone - it should pull the right schema

## Monitoring

### Check Workflow Execution

1. Go to **Actions** tab in GitHub
2. Look for two workflow runs from the same commit:
   - "Publish idun-agent-schema to TestPyPI"
   - "Publish idun-agent-engine to TestPyPI"
3. Engine should run AFTER schema completes

### Verify in Logs

**Schema workflow logs:**
```
Publishing version: 0.2.0.dev20251009143025
From branch: feature-branch
Commit: a1b2c3d
```

**Engine workflow logs:**
```
Schema workflow triggered this run, so schema was modified
Looking for latest schema dev version on TestPyPI...
Found schema version on TestPyPI: 0.2.0.dev20251009143025
Will use test schema version: 0.2.0.dev20251009143025
Updating schema dependency to test version: 0.2.0.dev20251009143025
✓ Package found on TestPyPI!
Installing schema test version from TestPyPI...
Building with schema from TestPyPI...
```

## Architecture Diagram

```
Commit to feature branch
        │
        ├─── Changes to schema? ────────┐
        │                               │
        │                               ▼
        │                    Schema Workflow Runs
        │                               │
        │                               ▼
        │                    Publish schema to TestPyPI
        │                               │
        │                               ▼
        │                    Trigger Engine Workflow ──┐
        │                                              │
        ├─── Changes to engine? ───────────────────────┤
        │                                              │
        └──────────────────────────────────────────────┤
                                                       ▼
                                            Engine Workflow Runs
                                                       │
                                                       ▼
                                            Check: Schema modified?
                                                       │
                                    ┌──────────────────┴───────────────────┐
                                    │                                      │
                                    ▼                                      ▼
                              YES: Update dep                        NO: Use stable
                              to test version                        schema from PyPI
                                    │                                      │
                                    ▼                                      │
                              Wait for TestPyPI                            │
                                    │                                      │
                                    ▼                                      │
                              Install test schema                          │
                                    │                                      │
                                    └──────────────────┬───────────────────┘
                                                       │
                                                       ▼
                                              Build engine package
                                                       │
                                                       ▼
                                            Publish engine to TestPyPI
```

## Summary

✅ **Fully Automated**: No manual intervention needed
✅ **Always Synchronized**: Engine uses correct schema version
✅ **Branch Isolated**: Each branch gets its own test versions
✅ **Safe**: Stable PyPI versions unaffected
✅ **Traceable**: Workflow logs show all version decisions
