# 🔐 Setup GitHub Secrets for Release

Quick guide to configure the required secrets for automated releases.

## Required Secrets

You need to configure **2 secrets** in your GitHub repository.

## Optional Secrets for Dev Image Publishing

The manual dev image workflow in [`.github/workflows/publish_dev_images.yml`](/Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.github/workflows/publish_dev_images.yml) uses Google Cloud authentication and Artifact Registry.

Configure these additional repository secrets if you want to build and push dev/test images manually:

- `GCP_WORKLOAD_ID_PROVIDER`
- `GCP_SERVICE_ACCOUNT_EMAIL`
- `GCP_REGION`
- `GCP_PROJECT_ID`

## Step-by-Step Setup

### 1. Docker Hub Token

#### Create Docker Hub Access Token

1. **Login to Docker Hub**
   - Go to: <https://hub.docker.com/>
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
   - Navigate to: <https://pypi.org/manage/account/publishing/>
   - (You need to be logged in)

2. **Add Pending Publisher**
   - Click "Add a new pending publisher"
   - Fill in the form:

     ```text
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

## Manual Dev Image Publishing

CI no longer publishes dev images automatically. Validation remains in [`.github/workflows/ci.yml`](/Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.github/workflows/ci.yml), while optional dev/test image publishing is handled manually via [`.github/workflows/publish_dev_images.yml`](/Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.github/workflows/publish_dev_images.yml).

### Required CI checks after the split

The CI workflow is now validation-only. The required checks should be:

- `Lint, type-check, and secrets scan`
- `Test engine (Py3.12)`
- `Test manager (Py3.12)`

### How to trigger the dev image workflow

1. Open the GitHub repository Actions tab.
2. Select **Publish Dev Docker Images**.
3. Click **Run workflow**.
4. Fill the inputs:
   - `ref`: branch, tag, or commit SHA to build
   - `services`: `manager`, `web`, or `both`
   - `tag`: optional explicit image tag override
   - `push_latest`: optional boolean to also update `latest`
5. Approve the `dev` environment when GitHub requests it.

### What happens

The workflow:

- checks out the requested ref
- authenticates to Google Cloud using Workload Identity
- pushes selected images to Artifact Registry
- writes the exact pushed image tags in the workflow summary

### Notes on release workflow reuse

For now, the release Docker publishing flow in [`.github/workflows/release.yml`](/Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform/.github/workflows/release.yml) remains unchanged.

This keeps the change small and low-risk. If dev image publishing stabilizes and needs less duplication later, Docker build/push logic can be extracted into a reusable workflow in a second pass.

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

```text
https://github.com/YOUR-USERNAME/idun-agent-platform/settings/secrets/actions
```

### PyPI Trusted Publishing

```text
https://pypi.org/manage/account/publishing/
```

### Docker Hub Security

```text
https://hub.docker.com/settings/security
```

## Summary

Once you've completed these steps:

✅ **Docker Hub**: 2 secrets configured
✅ **PyPI**: Trusted publishing configured for 2 packages
✅ **GitHub**: Workflow ready to run

You're ready to create your first release! 🚀

See `RELEASE_GUIDE.md` for the complete release process.
