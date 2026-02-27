#!/usr/bin/env bash
set -e

VERSION="$1"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

if [[ ! "$VERSION" =~ ^[0-9] ]]; then
  echo "Error: Version must start with a number (e.g., 1.0.0, not v1.0.0)"
  exit 1
fi

# Fail if working tree is dirty
if ! git diff-index --quiet HEAD --; then
  echo "Error: Working tree has uncommitted changes. Please commit or stash first."
  git diff --stat
  exit 1
fi

TAG="v${VERSION}"
PACKAGE_JSON="packages/cli/package.json"
CHANGELOG="packages/cli/CHANGELOG.md"

# Check that changelog has been updated (hard fail)
if ! grep -q "## \[${VERSION}\]" "$CHANGELOG" 2>/dev/null; then
  echo "Error: $CHANGELOG doesn't have an entry for version ${VERSION}"
  echo "Please add a '## [${VERSION}]' section before releasing."
  exit 1
fi

# Get current version
CURRENT_VERSION=$(grep -o '"version": "[^"]*"' "$PACKAGE_JSON" | grep -o '[0-9][^"]*')
echo "Updating CLI version: $CURRENT_VERSION -> $VERSION"

# Update package.json version
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$PACKAGE_JSON"

# Commit, tag, and push
git add "$PACKAGE_JSON" "$CHANGELOG"
git commit -m "Release CLI v${VERSION}"

# Push commit and tag separately (tag triggers the npm publish workflow)
git push origin HEAD
git tag "$TAG"
git push origin "$TAG"

echo "Released CLI v${VERSION}"
echo "CI will build and publish to npm: https://github.com/kzahel/web-server/actions"
echo ""
echo "After publish, users can install with:"
echo "  npx ok200"
