#!/usr/bin/env bash
set -euo pipefail

version="${1:-}"
build="${2:-}"
mode="${3:-}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
project_spec="$repo_root/ios/project.yml"
project_file="$repo_root/ios/OK200.xcodeproj/project.pbxproj"
changelog="$repo_root/ios/CHANGELOG.md"

if [[ -z "$version" || -z "$build" || ( -n "$mode" && "$mode" != "--check" ) ]]; then
  echo "Usage: $0 <version> <build-number> [--check]" >&2
  exit 1
fi
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must use numeric X.Y.Z without a prefix" >&2
  exit 1
fi
if [[ ! "$build" =~ ^[1-9][0-9]*$ ]]; then
  echo "Error: Build number must be a positive integer" >&2
  exit 1
fi

cd "$repo_root"
if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Error: iOS releases must run from main" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "Error: Working tree has uncommitted or untracked changes" >&2
  git status --short
  exit 1
fi

tag="ios-v${version}-b${build}"
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  echo "Error: Local tag already exists: $tag" >&2
  exit 1
fi
if ! remote_tag="$(git ls-remote --tags origin "refs/tags/$tag")"; then
  echo "Error: Could not query remote tags from origin" >&2
  exit 1
fi
if [[ -n "$remote_tag" ]]; then
  echo "Error: Remote tag already exists: $tag" >&2
  exit 1
fi
if ! rg -F -q "## $version ($build)" "$changelog"; then
  echo "Error: iOS changelog has no entry for $version ($build)" >&2
  exit 1
fi

current_version="$(sed -n 's/^[[:space:]]*MARKETING_VERSION: *//p' "$project_spec" | head -n 1)"
current_build="$(sed -n 's/^[[:space:]]*CURRENT_PROJECT_VERSION: *//p' "$project_spec" | head -n 1)"
[[ "$current_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$current_build" =~ ^[1-9][0-9]*$ ]] || {
  echo "Error: Current iOS version/build settings are malformed" >&2
  exit 1
}

if ! node - "$current_version" "$version" <<'NODE'
const [current, target] = process.argv.slice(2).map((value) =>
  value.split(".").map(Number),
);
for (let index = 0; index < 3; index += 1) {
  if (target[index] > current[index]) process.exit(0);
  if (target[index] < current[index]) process.exit(1);
}
process.exit(0);
NODE
then
  echo "Error: Target version $version is older than $current_version" >&2
  exit 1
fi

if [[ "$version" != "$current_version" || "$build" != "$current_build" ]]; then
  if (( build <= current_build )); then
    echo "Error: Changed candidates must increase build number beyond $current_build" >&2
    exit 1
  fi
fi

"$script_dir/release-check.sh" ios

if [[ "$mode" == "--check" ]]; then
  echo "Release preflight passed for $tag. No files, commits, tags, or remotes changed."
  exit 0
fi

if [[ "$version" != "$current_version" || "$build" != "$current_build" ]]; then
  sed -i '' "s/^    CURRENT_PROJECT_VERSION: .*/    CURRENT_PROJECT_VERSION: $build/" "$project_spec"
  sed -i '' "s/^    MARKETING_VERSION: .*/    MARKETING_VERSION: $version/" "$project_spec"
  "$repo_root/ios/scripts/generate-project.sh"
  "$script_dir/release-check.sh" ios

  git add "$project_spec" "$project_file" "$changelog"
  git commit -m "Release iOS v${version} build ${build}" -m "Topic: ios-native-swift"
fi

git tag "$tag"

echo "Prepared local iOS tag $tag at $(git rev-parse HEAD)."
echo "Nothing was pushed, built in CI, uploaded, submitted, or published."
echo "Maintainer push command: git push --atomic origin main $tag"
echo "After the tag is pushed, manually dispatch the iOS App Store Candidate workflow at $tag."
