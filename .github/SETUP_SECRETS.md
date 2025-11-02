# 🔐 Setup GitHub Secrets for Release

Quick guide to configure the required secrets for automated releases.

## Required Secrets

You need to configure **2 secrets** in your GitHub repository.

## Step-by-Step Setup

### 1. Docker Hub Token

#### Create Docker Hub Access Token

1. **Login to Docker Hub**
   - Go to: https://hub.docker.com/
   - Sign in with your account (`freezaa9`)

2. **Navigate to Security Settings**
   - Click your profile icon (top right)
   - Select "Account Settings"
   - Click "Security" in the left sidebar

3. **Create New Access Token**
   - Click "New Access Token"
   - **Description**: `GitHub Actions - Idun Agent Platform`
   - **Access permissions**: `Read, Write, Delete`
   - Click "Generate"
   - **⚠️ IMPORTANT**: Copy the token immediately (you won't see it again!)

#### Add to GitHub Secrets

1. **Go to Repository Settings**
   - Navigate to: `https://github.com/your-username/idun-agent-platform/settings/secrets/actions`

2. **Add DOCKERHUB_USERNAME**
   - Click "New repository secret"
   - **Name**: `DOCKERHUB_USERNAME`
   - **Secret**: `freezaa9`
   - Click "Add secret"

3. **Add DOCKERHUB_TOKEN**
   - Click "New repository secret"
   - **Name**: `DOCKERHUB_TOKEN`
   - **Secret**: Paste the token you copied
   - Click "Add secret"

### 2. PyPI Trusted Publishing (No Token Needed!)

Instead of API tokens, we use **Trusted Publishing** (more secure, no tokens to manage).

#### For idun-agent-schema

1. **Go to PyPI**
   - Navigate to: https://pypi.org/manage/account/publishing/
   - (You need to be logged in)

2. **Add Pending Publisher**
   - Click "Add a new pending publisher"
   - Fill in the form:
     ```
     PyPI Project Name:    idun-agent-schema
     Owner:                your-github-username (or organization)
     Repository name:      idun-agent-platform
     Workflow name:        release.yml
     Environment name:     (leave empty)
     ```
   - Click "Add"

#### For idun-agent-engine

1. **Repeat the same process**
   - PyPI Project Name: `idun-agent-engine`
   - All other fields same as above

> **Note**: If the packages don't exist on PyPI yet, you'll need to upload them manually first (see "First Time Setup" below).

## Verification

### Check Secrets are Set

1. Go to: `https://github.com/your-username/idun-agent-platform/settings/secrets/actions`
2. You should see:
   - ✅ `DOCKERHUB_USERNAME`
   - ✅ `DOCKERHUB_TOKEN`

### Test the Setup

Create a test release to verify everything works:

```bash
# Create a test tag
git tag v0.0.1-test
git push origin v0.0.1-test

# Create a release from this tag on GitHub
# Watch the Actions tab to see if it works
```

If it fails, check the error messages and verify your secrets.

## First Time Setup (If Packages Don't Exist on PyPI)

If this is your first release and the packages don't exist on PyPI yet:

### Option 1: Manual First Upload

```bash
# Install twine
pip install twine

# Build and upload schema
cd libs/idun_agent_schema
uv build
twine upload dist/*

# Build and upload engine
cd ../idun_agent_engine
uv build
twine upload dist/*
```

You'll be prompted for your PyPI username and password.

### Option 2: Use TestPyPI First

Test the workflow with TestPyPI before going to production:

1. Configure TestPyPI trusted publishing
2. Modify the workflow to use TestPyPI
3. Test the release
4. Then configure for production PyPI

## Security Best Practices

### ✅ Do's
- ✅ Use access tokens (not passwords)
- ✅ Use trusted publishing for PyPI (no tokens!)
- ✅ Set minimal permissions on tokens
- ✅ Rotate tokens regularly
- ✅ Use repository secrets (not environment variables in code)

### ❌ Don'ts
- ❌ Never commit tokens to git
- ❌ Never share tokens in chat/email
- ❌ Don't use your Docker Hub password
- ❌ Don't use classic PyPI tokens (use trusted publishing)

## Troubleshooting

### Docker Hub Login Fails

**Error**: `Error: Cannot perform an interactive login`

**Check**:
1. Is `DOCKERHUB_USERNAME` set correctly?
2. Is `DOCKERHUB_TOKEN` a token (not password)?
3. Is the token still valid? (Check Docker Hub security settings)

**Fix**:
- Regenerate the Docker Hub token
- Update the `DOCKERHUB_TOKEN` secret

### PyPI Trusted Publishing Fails

**Error**: `Trusted publishing exchange failure`

**Check**:
1. Is the publisher configured on PyPI?
2. Does the workflow name match exactly? (`release.yml`)
3. Is the release on the `main` branch?

**Fix**:
- Verify publisher configuration on PyPI
- Ensure workflow file is named `release.yml`
- Check that you're releasing from `main` branch

### Package Not Found on PyPI

**Error**: `Package 'idun-agent-schema' not found`

**Fix**:
- Do a manual first upload (see "First Time Setup" above)
- Then configure trusted publishing
- Then use the automated workflow

## Quick Reference

### GitHub Secrets Location
```
https://github.com/YOUR-USERNAME/idun-agent-platform/settings/secrets/actions
```

### PyPI Trusted Publishing
```
https://pypi.org/manage/account/publishing/
```

### Docker Hub Security
```
https://hub.docker.com/settings/security
```

## Summary

Once you've completed these steps:

✅ **Docker Hub**: 2 secrets configured
✅ **PyPI**: Trusted publishing configured for 2 packages
✅ **GitHub**: Workflow ready to run

You're ready to create your first release! 🚀

See `RELEASE_GUIDE.md` for the complete release process.
