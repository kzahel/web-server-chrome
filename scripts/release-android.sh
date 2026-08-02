#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must use numeric semver (e.g., 0.2.1, not v0.2.1)"
  exit 1
fi

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Error: Android releases must run from main"
  exit 1
fi

# Fail if the working tree is dirty, including untracked files.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: Working tree has uncommitted changes. Please commit or stash first."
  git status --short
  exit 1
fi

TAG="android-v${VERSION}"
BUILD_GRADLE="android/app/build.gradle.kts"
CHANGELOG="android/CHANGELOG.md"

# Check that changelog has been updated
if ! grep -q "## \[${VERSION}\]" "$CHANGELOG" 2>/dev/null; then
  echo "Error: $CHANGELOG doesn't have an entry for version ${VERSION}"
  echo "Please add a '## [${VERSION}]' section before releasing."
  exit 1
fi

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Error: Local tag already exists: $TAG"
  exit 1
fi
if ! REMOTE_TAG="$(git ls-remote --tags origin "refs/tags/$TAG")"; then
  echo "Error: Could not query remote tags from origin"
  exit 1
fi
if [[ -n "$REMOTE_TAG" ]]; then
  echo "Error: Remote tag already exists: $TAG"
  exit 1
fi

# Get current values
CURRENT_VERSION=$(grep 'versionName' "$BUILD_GRADLE" | grep -o '"[^"]*"' | tr -d '"')
CURRENT_CODE=$(grep 'versionCode' "$BUILD_GRADLE" | grep -o '[0-9]\+')
NEW_CODE=$((CURRENT_CODE + 1))

if ! node - "$CURRENT_VERSION" "$VERSION" <<'NODE'
const [current, target] = process.argv.slice(2).map((version) =>
  version.split(".").map(Number),
);
for (let index = 0; index < 3; index += 1) {
  if (target[index] > current[index]) process.exit(0);
  if (target[index] < current[index]) process.exit(1);
}
process.exit(1);
NODE
then
  echo "Error: Target version $VERSION must be greater than current version $CURRENT_VERSION"
  exit 1
fi

echo "Updating Android version: $CURRENT_VERSION -> $VERSION (versionCode $CURRENT_CODE -> $NEW_CODE)"

(cd android && ./gradlew :app:compileDebugKotlin :app:testDebugUnitTest :app:lintDebug)

# Update versionName
sed -i '' "s/versionName = \"[^\"]*\"/versionName = \"$VERSION\"/" "$BUILD_GRADLE"

# Update versionCode
sed -i '' "s/versionCode = $CURRENT_CODE/versionCode = $NEW_CODE/" "$BUILD_GRADLE"

# Commit and tag locally. Publishing remains a separate authorized action.
git add "$BUILD_GRADLE" "$CHANGELOG"
git commit -m "Release Android v${VERSION}"
git tag "$TAG"

echo "Prepared Android v${VERSION} (versionCode $NEW_CODE) and local tag $TAG."
echo "Nothing was pushed or published."
echo "Maintainer release command: git push --atomic origin main $TAG"
echo "Pushing the tag will let CI build the signed APK/AAB and create the GitHub release."
echo ""
echo "After CI completes, download the AAB from the GitHub release and upload to Google Play Console."
