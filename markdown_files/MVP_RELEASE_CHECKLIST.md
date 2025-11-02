# 🚀 MVP Release Checklist

Complete checklist to launch your Idun Agent Platform MVP.

## 📋 Pre-Release Setup (One-Time)

### 1. Configure GitHub Secrets

Follow `.github/SETUP_SECRETS.md` to configure:

- [ ] `DOCKERHUB_USERNAME` - Set to `freezaa9`
- [ ] `DOCKERHUB_TOKEN` - Create from Docker Hub
- [ ] PyPI Trusted Publishing - Configure for `idun-agent-schema`
- [ ] PyPI Trusted Publishing - Configure for `idun-agent-engine`

**Verification**: Check `Settings → Secrets and variables → Actions`

### 2. First Manual Upload to PyPI (If Packages Don't Exist)

If this is your first release:

```bash
# Install twine
pip install twine

# Upload schema
cd libs/idun_agent_schema
uv build
twine upload dist/*

# Upload engine
cd ../idun_agent_engine
uv build
twine upload dist/*
```

After this, trusted publishing will work for future releases.

## 🎯 Release Process

### Step 1: Pre-Flight Checks

- [ ] All features complete and tested
- [ ] All tests passing locally
- [ ] All PRs merged to `main`
- [ ] No uncommitted changes
- [ ] Documentation updated
- [ ] CHANGELOG updated (if you have one)

### Step 2: Run Tests

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

- [ ] All tests pass

### Step 3: Create Release Tag

**Option A: Use the script (Recommended)**

```bash
./scripts/create-release.sh
```

**Option B: Manual**

```bash
# Ensure you're on main
git checkout main
git pull origin main

# Create and push tag
git tag -a v0.2.1 -m "Release 0.2.1"
git push origin v0.2.1
```

- [ ] Tag created and pushed

### Step 4: Create GitHub Release

1. Go to: `https://github.com/your-org/idun-agent-platform/releases/new`

2. **Select tag**: `v0.2.1`

3. **Release title**: `v0.2.1 - MVP Release`

4. **Description** (example):
   ```markdown
   ## 🎉 Idun Agent Platform MVP

   First production release of the Idun Agent Platform!

   ### ✨ Features
   - Agent management API
   - LangGraph integration
   - PostgreSQL persistence
   - Docker deployment
   - Observability hooks

   ### 📦 Installation

   **Python Packages:**
   ```bash
   pip install idun-agent-schema==0.2.1
   pip install idun-agent-engine==0.2.1
   ```

   **Docker:**
   ```bash
   docker pull freezaa9/idun-ai:0.2.1
   ```

   ### 🚀 Quick Start

   ```bash
   docker run -p 8080:8080 \
     -e DATABASE_URL="postgresql+asyncpg://..." \
     freezaa9/idun-ai:0.2.1
   ```

   ### 📚 Documentation
   - [Getting Started](link)
   - [API Docs](link)
   - [Docker Hub](https://hub.docker.com/r/freezaa9/idun-ai)
   ```

5. **Publish**: Click "Publish release"

- [ ] GitHub release created

### Step 5: Monitor Workflow

1. Go to: `Actions` tab
2. Click on "Release Idun Agent Platform" workflow
3. Watch the progress:
   - [ ] ✅ Publish Schema to PyPI (~2-3 min)
   - [ ] ✅ Publish Engine to PyPI (~2-3 min)
   - [ ] ✅ Build & Publish Manager Docker (~5-10 min)
   - [ ] ✅ Create Release Summary (~1 min)

**Total time**: ~10-15 minutes

### Step 6: Verify Release

**Schema on PyPI:**
```bash
pip install idun-agent-schema==0.2.1
python -c "import idun_agent_schema; print(idun_agent_schema.__version__)"
```
- [ ] Schema version correct

**Engine on PyPI:**
```bash
pip install idun-agent-engine==0.2.1
python -c "import idun_agent_engine; print(idun_agent_engine.__version__)"
```
- [ ] Engine version correct

**Docker Image:**
```bash
docker pull freezaa9/idun-ai:0.2.1
docker run -d -p 8080:8080 \
  -e DATABASE_URL="postgresql+asyncpg://user:pass@host:5432/db" \
  freezaa9/idun-ai:0.2.1

# Test health endpoint
curl http://localhost:8080/api/v1/healthz
```
- [ ] Docker image pulls successfully
- [ ] Container starts without errors
- [ ] Health check returns 200 OK

## 📢 Post-Release

### Announcement

- [ ] Update documentation site
- [ ] Announce on social media
- [ ] Send email to users/beta testers
- [ ] Update README with latest version
- [ ] Post in relevant communities

### Monitoring

- [ ] Monitor Docker Hub downloads
- [ ] Monitor PyPI downloads
- [ ] Watch for GitHub issues
- [ ] Check error tracking (if configured)

### Documentation

- [ ] Update getting started guide
- [ ] Update API documentation
- [ ] Create migration guide (if breaking changes)
- [ ] Update examples with new version

## 🐛 Troubleshooting

### Workflow Failed

**Check the logs:**
1. Go to Actions tab
2. Click on the failed workflow
3. Click on the failed job
4. Read the error message

**Common issues:**
- [ ] Secrets not configured → Check `.github/SETUP_SECRETS.md`
- [ ] PyPI trusted publishing → Verify configuration on PyPI
- [ ] Docker Hub auth → Regenerate token
- [ ] Version already exists → Use a new version number

### Package Not Found

**If packages aren't found on PyPI:**
- [ ] Wait 5-10 minutes for propagation
- [ ] Check PyPI directly: https://pypi.org/project/idun-agent-schema/
- [ ] Verify the workflow completed successfully

### Docker Image Issues

**If Docker image has problems:**
- [ ] Check the build logs in GitHub Actions
- [ ] Verify the Dockerfile builds locally
- [ ] Check Docker Hub: https://hub.docker.com/r/freezaa9/idun-ai

## 📊 Success Metrics

After release, track:

- [ ] PyPI downloads (schema + engine)
- [ ] Docker pulls
- [ ] GitHub stars/forks
- [ ] Issues/bug reports
- [ ] User feedback

## 🎉 You're Live!

Once all checks pass:

✅ **Schema** published to PyPI
✅ **Engine** published to PyPI
✅ **Manager** published to Docker Hub
✅ **Documentation** updated
✅ **Announcement** sent

**Congratulations on your MVP launch!** 🚀

## 📝 Next Release

For your next release:

1. **Update version numbers** in the script
2. **Follow the same process** (it's automated!)
3. **Monitor and iterate** based on feedback

The process is now streamlined:
```bash
./scripts/create-release.sh
# → Create GitHub release
# → Wait ~15 minutes
# → Done! ✅
```

## 🔗 Quick Links

- **Release Workflow**: `.github/workflows/release.yml`
- **Release Guide**: `RELEASE_GUIDE.md`
- **Setup Secrets**: `.github/SETUP_SECRETS.md`
- **Create Release Script**: `scripts/create-release.sh`

---

**Need help?** Check `RELEASE_GUIDE.md` for detailed instructions.
