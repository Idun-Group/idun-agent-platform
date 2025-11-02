# ⚡ Quick Release Reference

TL;DR for releasing Idun Agent Platform.

## 🎯 One-Time Setup (5 minutes)

```bash
# 1. Add GitHub Secrets (Settings → Secrets → Actions)
DOCKERHUB_USERNAME = freezaa9
DOCKERHUB_TOKEN = <create at hub.docker.com/settings/security>

# 2. Configure PyPI Trusted Publishing (pypi.org/manage/account/publishing/)
# Add for: idun-agent-schema
# Add for: idun-agent-engine
```

## 🚀 Release Process (2 minutes + 15 min automation)

### Step 1: Create Tag (30 seconds)

```bash
./scripts/create-release.sh
# Enter version (e.g., 0.2.1)
# Confirm
```

### Step 2: Create GitHub Release (1 minute)

1. Go to: https://github.com/your-org/idun-agent-platform/releases/new
2. Select tag: `v0.2.1`
3. Title: `v0.2.1 - MVP Release`
4. Add description
5. Click "Publish release"

### Step 3: Wait for Automation (~15 minutes)

GitHub Actions will automatically:
- ✅ Publish `idun-agent-schema` to PyPI
- ✅ Publish `idun-agent-engine` to PyPI
- ✅ Build and push `freezaa9/idun-ai:0.2.1` to Docker Hub

### Step 4: Verify (2 minutes)

```bash
# Check PyPI
pip install idun-agent-schema==0.2.1
pip install idun-agent-engine==0.2.1

# Check Docker Hub
docker pull freezaa9/idun-ai:0.2.1
```

## ✅ Done!

Your release is live:
- 📦 PyPI: https://pypi.org/project/idun-agent-schema/
- 📦 PyPI: https://pypi.org/project/idun-agent-engine/
- 🐳 Docker: https://hub.docker.com/r/freezaa9/idun-ai

## 📚 Full Documentation

- **Detailed Guide**: `RELEASE_GUIDE.md`
- **Setup Secrets**: `.github/SETUP_SECRETS.md`
- **Checklist**: `MVP_RELEASE_CHECKLIST.md`

## 🆘 Quick Fixes

**Workflow failed?**
```bash
# Check: Settings → Secrets → Actions
# Verify: DOCKERHUB_USERNAME and DOCKERHUB_TOKEN are set
```

**PyPI error?**
```bash
# Configure trusted publishing at:
# https://pypi.org/manage/account/publishing/
```

**Docker auth error?**
```bash
# Regenerate token at:
# https://hub.docker.com/settings/security
```

---

**That's it!** Simple, automated, repeatable. 🎉
