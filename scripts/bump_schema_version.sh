#!/bin/bash
# Script to bump idun-agent-schema version across the monorepo
# Usage: ./scripts/bump_schema_version.sh <new_version>
#
# Example: ./scripts/bump_schema_version.sh 0.3.0

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <new_version>"
    echo "Example: $0 0.3.0"
    exit 1
fi

NEW_VERSION=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 Bumping idun-agent-schema to version $NEW_VERSION"
echo ""

# Update schema package version
echo "📦 Updating schema package version..."
SCHEMA_PYPROJECT="$REPO_ROOT/libs/idun_agent_schema/pyproject.toml"
sed -i '' "s/^version = \".*\"/version = \"$NEW_VERSION\"/" "$SCHEMA_PYPROJECT"
echo "✅ Updated $SCHEMA_PYPROJECT"

# Update manager dependency
echo "📦 Updating manager dependency..."
MANAGER_PYPROJECT="$REPO_ROOT/services/idun_agent_manager/pyproject.toml"
sed -i '' "s/\"idun_agent_schema==.*\"/\"idun_agent_schema==$NEW_VERSION\"/" "$MANAGER_PYPROJECT"
echo "✅ Updated $MANAGER_PYPROJECT"

# Update engine dependency (uses range versioning)
echo "📦 Updating engine dependency..."
ENGINE_PYPROJECT="$REPO_ROOT/libs/idun_agent_engine/pyproject.toml"
# Extract major.minor from version (e.g., 0.3.0 -> 0.3)
MAJOR_MINOR=$(echo "$NEW_VERSION" | cut -d. -f1,2)
NEXT_MINOR=$(echo "$NEW_VERSION" | awk -F. '{print $1"."($2+1)".0"}')
sed -i '' "s/\"idun-agent-schema>=.*,<.*\"/\"idun-agent-schema>=$NEW_VERSION,<$NEXT_MINOR\"/" "$ENGINE_PYPROJECT"
echo "✅ Updated $ENGINE_PYPROJECT"

echo ""
echo "✨ Version bump complete!"
echo ""
echo "Next steps:"
echo "1. Review changes: git diff"
echo "2. Build package: cd libs/idun_agent_schema && rm -rf dist/ && uv build"
echo "3. Publish to PyPI: cd libs/idun_agent_schema && uv publish"
echo "4. Commit changes: git add -A && git commit -m 'chore: bump idun-agent-schema to v$NEW_VERSION'"
