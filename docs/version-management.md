# Version Management Guide

## Schema Version Management

The `idun-agent-schema` package is a centralized schema library used by both the agent engine and manager. Proper version management is crucial for maintaining compatibility across the platform.

### Version Strategy

- **Schema Package (`idun-agent-schema`)**: Uses strict semantic versioning (X.Y.Z)
- **Manager Dependency**: Uses exact version pinning (`==X.Y.Z`) for predictability
- **Engine Dependency**: Uses range versioning (`>=X.Y.Z,<X.(Y+1).0`) for flexibility

### Bumping Schema Version

#### Quick Method (Recommended)

Use the automated script:

```bash
./scripts/bump_schema_version.sh <new_version>
```

Example:
```bash
./scripts/bump_schema_version.sh 0.3.0
```

This will automatically update:
1. Schema package version in `libs/idun_agent_schema/pyproject.toml`
2. Manager dependency in `services/idun_agent_manager/pyproject.toml`
3. Engine dependency range in `libs/idun_agent_engine/pyproject.toml`

#### Manual Method

If you need to bump manually:

1. **Update Schema Version**
   ```bash
   # Edit libs/idun_agent_schema/pyproject.toml
   version = "0.3.0"  # Change this
   ```

2. **Update Manager Dependency**
   ```bash
   # Edit services/idun_agent_manager/pyproject.toml
   "idun_agent_schema==0.3.0"  # Exact version
   ```

3. **Update Engine Dependency**
   ```bash
   # Edit libs/idun_agent_engine/pyproject.toml
   "idun-agent-schema>=0.3.0,<0.4.0"  # Version range
   ```

### Publishing to PyPI

After bumping the version:

1. **Clean and Build**
   ```bash
   cd libs/idun_agent_schema
   rm -rf dist/
   uv build
   ```

2. **Verify Build**
   ```bash
   ls -lh dist/
   # Should show files with new version number
   ```

3. **Publish**
   ```bash
   uv publish
   # Enter PyPI token when prompted
   ```

### Version Checklist

Before releasing a new schema version:

- [ ] Update schema package version
- [ ] Update manager dependency
- [ ] Update engine dependency range
- [ ] Clean old build artifacts (`rm -rf dist/`)
- [ ] Build package (`uv build`)
- [ ] Verify version in dist files
- [ ] Publish to PyPI (`uv publish`)
- [ ] Commit changes with message: `chore: bump idun-agent-schema to vX.Y.Z`
- [ ] Tag release: `git tag idun-agent-schema-vX.Y.Z`

### Semantic Versioning Guidelines

For `idun-agent-schema`:

- **Major (X.0.0)**: Breaking changes to schema structure
  - Removing fields
  - Changing field types incompatibly
  - Renaming schemas

- **Minor (0.X.0)**: Backward-compatible additions
  - Adding new optional fields
  - Adding new schema models
  - Deprecating (but not removing) fields

- **Patch (0.0.X)**: Backward-compatible fixes
  - Documentation updates
  - Bug fixes in validators
  - Type hint improvements

### Troubleshooting

#### Published wrong version
If you accidentally published the wrong version:
1. You cannot delete from PyPI, but you can yank: `uv publish --yank <version>`
2. Bump to next patch version and republish

#### Version conflicts
If you get dependency resolution errors:
1. Check all three files have consistent versions
2. Run `uv lock --upgrade` in affected packages
3. Verify PyPI has the version you're trying to use

#### Build includes old version
Always clean dist before building:
```bash
rm -rf dist/
uv build
```
