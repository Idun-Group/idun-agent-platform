#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Idun Agent Platform Release Creator      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "${RED}❌ Error: You must be on the 'main' branch to create a release${NC}"
    echo -e "${YELLOW}   Current branch: $CURRENT_BRANCH${NC}"
    exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}❌ Error: You have uncommitted changes${NC}"
    echo -e "${YELLOW}   Please commit or stash your changes first${NC}"
    git status --short
    exit 1
fi

# Pull latest changes
echo -e "${BLUE}📥 Pulling latest changes...${NC}"
git pull origin main

# Get version from user
echo ""
echo -e "${GREEN}Enter the version number (without 'v' prefix):${NC}"
echo -e "${YELLOW}Examples: 0.2.1, 1.0.0, 0.3.0-beta${NC}"
read -p "Version: " VERSION

# Validate version format
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9]+)?$ ]]; then
    echo -e "${RED}❌ Invalid version format${NC}"
    echo -e "${YELLOW}   Use semantic versioning: MAJOR.MINOR.PATCH (e.g., 0.2.1)${NC}"
    exit 1
fi

TAG="v$VERSION"

# Check if tag already exists
if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo -e "${RED}❌ Error: Tag $TAG already exists${NC}"
    exit 1
fi

# Confirm
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}Ready to create release:${NC}"
echo -e "  Version: ${BLUE}$VERSION${NC}"
echo -e "  Tag:     ${BLUE}$TAG${NC}"
echo -e "  Branch:  ${BLUE}$CURRENT_BRANCH${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Release cancelled${NC}"
    exit 0
fi

# Create and push tag
echo ""
echo -e "${BLUE}🏷️  Creating tag $TAG...${NC}"
git tag -a "$TAG" -m "Release $VERSION"

echo -e "${BLUE}📤 Pushing tag to GitHub...${NC}"
git push origin "$TAG"

echo ""
echo -e "${GREEN}✅ Tag created and pushed!${NC}"
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}Next Steps:${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
echo ""
echo -e "1. ${BLUE}Go to GitHub Releases:${NC}"
echo -e "   https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/releases/new"
echo ""
echo -e "2. ${BLUE}Select the tag:${NC} $TAG"
echo ""
echo -e "3. ${BLUE}Fill in release details:${NC}"
echo -e "   - Title: v$VERSION - [Your Title]"
echo -e "   - Description: What's new, bug fixes, etc."
echo ""
echo -e "4. ${BLUE}Click 'Publish release'${NC}"
echo ""
echo -e "5. ${BLUE}Monitor the workflow:${NC}"
echo -e "   https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/actions"
echo ""
echo -e "${GREEN}The automated workflow will:${NC}"
echo -e "  ✅ Publish idun-agent-schema to PyPI"
echo -e "  ✅ Publish idun-agent-engine to PyPI"
echo -e "  ✅ Build and push Docker image to freezaa9/idun-ai:$VERSION"
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}🎉 Happy releasing!${NC}"
