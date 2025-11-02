# 🚀 Release Guide - Idun Agent Platform

Complete guide to releasing a new version of the Idun Agent Platform.

## 📋 Prerequisites

### 1. GitHub Secrets Configuration

You need to configure these secrets in your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username | Your Docker Hub account name |
| `DOCKERHUB_TOKEN` | Docker Hub access token | [Create token](https://hub.docker.com/settings/security) |

### 2. PyPI Trusted Publishing

Configure trusted publishing for both packages (no API tokens needed!):

#### For `idun-agent-schema`:
1. Go to https://pypi.org/manage/account/publishing/
2. Click "Add a new pending publisher"
3. Fill in:
   - **PyPI Project Name**: `idun-agent-schema`
   - **Owner**: `your-github-username` or `your-org`
   - **Repository name**: `idun-agent-platform`
   - **Workflow name**: `release.yml`
   - **Environment name**: (leave empty)

#### For `idun-agent-engine`:
1. Same steps as above
2. **PyPI Project Name**: `idun-agent-engine`

> **Note**: If packages don't exist on PyPI yet, you'll need to do the first manual upload, then configure trusted publishing.

## 🎯 Release Process

### Step 1: Prepare the Release

1. **Ensure all changes are merged to `main`**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Run tests locally**
   ```bash
   # Test schema
   cd libs/idun_agent_schema
   uv run pytest

   # Test engine
   cd ../idun_agent_engine
   uv run pytest

   # Test manager
   cd ../../services/idun_agent_manager
   uv run pytest
   ```

3. **Update CHANGELOG** (if you have one)
   - Document new features
   - List bug fixes
   - Note breaking changes

### Step 2: Create a GitHub Release

1. **Go to GitHub Releases**
   - Navigate to: `https://github.com/your-org/idun-agent-platform/releases`
   - Click "Draft a new release"

2. **Create a new tag**
   - Click "Choose a tag"
   - Enter: `v0.2.1` (or your version number)
   - Click "Create new tag: v0.2.1 on publish"

3. **Fill in release details**
   - **Release title**: `v0.2.1 - MVP Release` (or descriptive title)
   - **Description**:
     ```markdown
     ## 🎉 What's New

     ### Features
     - Feature 1
     - Feature 2

     ### Bug Fixes
     - Fix 1
     - Fix 2

     ### Breaking Changes
     - None

     ## 📦 Installation

     ```bash
     # Install Schema
     pip install idun-agent-schema==0.2.1

     # Install Engine
     pip install idun-agent-engine==0.2.1

     # Pull Manager Docker image
     docker pull freezaa9/idun-ai:0.2.1
     ```

     ## 🔗 Links
     - [Documentation](https://your-docs-url.com)
     - [Docker Hub](https://hub.docker.com/r/freezaa9/idun-ai)
     ```

4. **Publish the release**
   - Check "Set as the latest release"
   - Click "Publish release"

### Step 3: Monitor the Workflow

1. **Watch the GitHub Action**
   - Go to: `Actions` tab
   - Click on the running "Release Idun Agent Platform" workflow
   - Monitor each job:
     - ✅ Publish Schema to PyPI (~2-3 min)
     - ✅ Publish Engine to PyPI (~2-3 min)
     - ✅ Build & Publish Manager Docker (~5-10 min)
     - ✅ Create Release Summary (~1 min)

2. **Check for errors**
   - If any job fails, click on it to see logs
   - Common issues and fixes below

### Step 4: Verify the Release

1. **Verify Schema on PyPI**
   ```bash
   pip install idun-agent-schema==0.2.1
   python -c "import idun_agent_schema; print(idun_agent_schema.__version__)"
   # Should print: 0.2.1
   ```

2. **Verify Engine on PyPI**
   ```bash
   pip install idun-agent-engine==0.2.1
   python -c "import idun_agent_engine; print(idun_agent_engine.__version__)"
   # Should print: 0.2.1
   ```

3. **Verify Docker Image**
   ```bash
   docker pull freezaa9/idun-ai:0.2.1
   docker run -p 8080:8080 \
     -e DATABASE_URL="postgresql+asyncpg://..." \
     freezaa9/idun-ai:0.2.1

   # Test health endpoint
   curl http://localhost:8080/api/v1/healthz
   ```

## 🎉 Success!

Your release is complete! All three components are now published:
- ✅ Schema on PyPI
- ✅ Engine on PyPI
- ✅ Manager on Docker Hub

## 📝 Post-Release Checklist

- [ ] Verify all packages are accessible
- [ ] Update documentation with new version
- [ ] Announce release (blog, social media, etc.)
- [ ] Monitor for issues
- [ ] Update any deployment environments

## 🐛 Troubleshooting

### Issue: PyPI Trusted Publishing Not Working

**Error**: `Trusted publishing exchange failure`

**Solution**:
1. Verify the publisher is configured correctly on PyPI
2. Ensure workflow name matches exactly: `release.yml`
3. Check that the release is on the `main` branch

### Issue: Docker Hub Authentication Failed

**Error**: `Error: Cannot perform an interactive login from a non TTY device`

**Solution**:
1. Verify `DOCKERHUB_USERNAME` secret is set
2. Verify `DOCKERHUB_TOKEN` secret is set (not password!)
3. Regenerate Docker Hub token if needed

### Issue: Schema Not Found When Building Engine

**Error**: `Could not find a version that matches idun-agent-schema==0.2.1`

**Solution**:
- Wait a few minutes for PyPI to propagate
- The workflow has a 60-second wait, but sometimes it needs longer
- You can re-run the failed job

### Issue: Version Mismatch

**Error**: Package versions don't match the tag

**Solution**:
- The workflow automatically updates versions from the tag
- Check the `sed` commands in the workflow
- Ensure `pyproject.toml` has the correct format

### Issue: Multi-platform Docker Build Fails

**Error**: `multiple platforms feature is currently not supported`

**Solution**:
1. The workflow uses `docker/setup-buildx-action@v3`
2. If it still fails, remove `linux/arm64` from platforms temporarily:
   ```yaml
   platforms: linux/amd64  # Remove linux/arm64
   ```

## 🔄 Hotfix Release Process

For urgent fixes:

1. **Create a hotfix branch**
   ```bash
   git checkout -b hotfix/0.2.2
   ```

2. **Make the fix and test**
   ```bash
   # Make changes
   git add .
   git commit -m "fix: critical bug"
   ```

3. **Merge to main**
   ```bash
   git checkout main
   git merge hotfix/0.2.2
   git push origin main
   ```

4. **Create release** (same as above)
   - Tag: `v0.2.2`
   - Title: `v0.2.2 - Hotfix`

## 📊 Release Checklist Template

Copy this for each release:

```markdown
## Pre-Release
- [ ] All PRs merged to main
- [ ] Tests passing locally
- [ ] CHANGELOG updated
- [ ] Version numbers decided
- [ ] Breaking changes documented

## Release
- [ ] GitHub release created
- [ ] Tag created (v0.2.1)
- [ ] Release description complete
- [ ] Release published

## Post-Release
- [ ] Schema verified on PyPI
- [ ] Engine verified on PyPI
- [ ] Docker image verified on Docker Hub
- [ ] Health check passes
- [ ] Documentation updated
- [ ] Announcement sent
```

## 🎓 Best Practices

### Semantic Versioning

Follow [SemVer](https://semver.org/):
- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.2.0): New features, backwards compatible
- **PATCH** (0.2.1): Bug fixes, backwards compatible

### Release Frequency

- **MVP/Beta**: Release often (weekly/bi-weekly)
- **Stable**: Release on a schedule (monthly)
- **Hotfixes**: As needed

### Communication

- Write clear release notes
- Highlight breaking changes
- Provide migration guides
- Announce on relevant channels

## 🔗 Useful Links

- **PyPI Schema**: https://pypi.org/project/idun-agent-schema/
- **PyPI Engine**: https://pypi.org/project/idun-agent-engine/
- **Docker Hub**: https://hub.docker.com/r/freezaa9/idun-ai
- **GitHub Releases**: https://github.com/your-org/idun-agent-platform/releases
- **Trusted Publishing Guide**: https://docs.pypi.org/trusted-publishers/

## 💡 Pro Tips

1. **Test in staging first**: Use TestPyPI for testing releases
2. **Automate version bumping**: Consider using tools like `bump2version`
3. **Keep a CHANGELOG**: Makes release notes easier
4. **Tag early, tag often**: Tags are cheap, use them
5. **Monitor after release**: Watch for issues in the first 24 hours

---

**Ready to release?** Follow the steps above and you'll have a smooth release process! 🚀
