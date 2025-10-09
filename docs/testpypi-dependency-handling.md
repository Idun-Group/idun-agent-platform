# TestPyPI Dependency Handling

This document explains how the TestPyPI publishing workflows handle dependencies between `idun-agent-schema` and `idun-agent-engine`.

## The Challenge

`idun-agent-engine` depends on `idun-agent-schema`. To ensure both libraries are always in sync for testing, we need:

1. The test version of `idun-agent-schema` is published to TestPyPI FIRST
2. The test version of `idun-agent-engine` uses the LATEST test version of the schema
3. Both packages are published from the same commit

## The Simple Solution

**Every commit triggers BOTH workflows:**
1. Schema always publishes first
2. Engine always queries TestPyPI for the latest schema version
3. Engine always uses that latest test version

This ensures perfect synchronization without complex change detection logic.

## How It Works

### Workflow Execution Order

**On EVERY commit to ANY branch:**

1. **Schema Workflow Runs First** (`publish_schema_testpypi.yml`)
   - Triggers on every push
   - Publishes `idun-agent-schema==0.2.0.devTIMESTAMP` to TestPyPI

2. **Engine Workflow Runs After** (`publish_engine_testpypi.yml`)
   - Automatically triggered when schema workflow completes successfully
   - Queries TestPyPI for the latest schema version
   - Updates dependency to use that latest test version
   - Publishes `idun-agent-engine==0.1.0.devTIMESTAMP` to TestPyPI

### Automatic Dependency Resolution

The engine workflow automatically:

1. **Queries TestPyPI for Latest Schema**
   - Waits for up to 2 minutes for schema to be available
   - Polls every 5 seconds
   - Finds the latest dev version: `0.2.0.dev<TIMESTAMP>`

2. **Updates pyproject.toml**
   ```toml
   # Before:
   "idun-agent-schema>=0.2.0,<0.3.0"

   # After:
   "idun-agent-schema==0.2.0.dev20251009143025"  # Latest from TestPyPI
   ```

3. **Builds with Test Schema**
   - Always uses TestPyPI index for schema dependency
   - Uses PyPI for all other dependencies
   - Ensures engine is built with the latest test schema

## Usage Scenarios

### ANY Commit to ANY Branch

```bash
# Make any changes (schema, engine, docs, anything)
vim libs/idun_agent_schema/src/...
vim libs/idun_agent_engine/src/...
vim README.md
git commit -am "Any changes"
git push
```

**Result - ALWAYS:**
1. ✅ Schema workflow publishes `idun-agent-schema==0.2.0.devTIMESTAMP1`
2. ✅ Engine workflow automatically triggers
3. ✅ Engine queries TestPyPI for latest schema version
4. ✅ Engine finds `0.2.0.devTIMESTAMP1` and uses it
5. ✅ Engine publishes `idun-agent-engine==0.1.0.devTIMESTAMP2`
6. ✅ Both packages always in sync on TestPyPI

**Why this is simple:**
- No need to track what changed
- Always get fresh versions of both packages
- Engine always uses the latest test schema
- Guaranteed synchronization

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
      - '**'  # ALL branches, ALL commits
```
- Runs on EVERY commit to ANY branch
- Publishes to TestPyPI
- Triggers engine workflow upon completion

### Engine Workflow (`publish_engine_testpypi.yml`)
```yaml
on:
  workflow_run:
    workflows: ["Publish idun-agent-schema to TestPyPI"]
    types:
      - completed
```
- ONLY runs when schema workflow completes successfully
- No direct push trigger
- Always queries TestPyPI for latest schema version

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
Waiting for latest schema version to be available on TestPyPI...
Attempt 1/24: Looking for latest schema dev version...
✓ Found schema version on TestPyPI: 0.2.0.dev20251009143025
Updating schema dependency to test version: 0.2.0.dev20251009143025
Updated pyproject.toml:
  "idun-agent-schema==0.2.0.dev20251009143025",
Building engine with test schema from TestPyPI...
```

## Architecture Diagram

```
        ANY Commit to ANY Branch
                │
                ▼
    ┌───────────────────────┐
    │ Schema Workflow Runs  │
    │                       │
    │ - Build schema        │
    │ - Publish to TestPyPI │
    └───────────┬───────────┘
                │
                ▼ (triggers on completion)
    ┌─────────────────────────────────┐
    │ Engine Workflow Runs            │
    │                                 │
    │ 1. Query TestPyPI for latest    │
    │    schema dev version           │
    │                                 │
    │ 2. Update engine dependency:    │
    │    "idun-agent-schema==X.Y.Z"   │
    │                                 │
    │ 3. Build engine with test       │
    │    schema from TestPyPI         │
    │                                 │
    │ 4. Publish to TestPyPI          │
    └─────────────────────────────────┘
                │
                ▼
    Both packages on TestPyPI,
    perfectly synchronized!
```

## Summary

✅ **Fully Automated**: No manual intervention needed
✅ **Always Synchronized**: Engine uses correct schema version
✅ **Branch Isolated**: Each branch gets its own test versions
✅ **Safe**: Stable PyPI versions unaffected
✅ **Traceable**: Workflow logs show all version decisions
