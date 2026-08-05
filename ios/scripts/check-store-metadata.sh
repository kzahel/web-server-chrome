#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ios_root="$(cd "$script_dir/.." && pwd)"
store_root="$ios_root/store"
locale_root="$store_root/en-US"
require_screenshots=false

if [[ "${1:-}" == "--require-screenshots" ]]; then
  require_screenshots=true
  shift
fi
if [[ $# -ne 0 ]]; then
  echo "Usage: $0 [--require-screenshots]" >&2
  exit 1
fi

read_field() {
  local field="$1"
  local path="$locale_root/$field.txt"
  [[ -s "$path" ]] || {
    echo "Missing App Store field: $path" >&2
    exit 1
  }
  sed -e '${/^$/d;}' "$path"
}

name="$(read_field name)"
subtitle="$(read_field subtitle)"
description="$(read_field description)"
keywords="$(read_field keywords)"
support_url="$(read_field support_url)"
marketing_url="$(read_field marketing_url)"
privacy_url="$(read_field privacy_url)"
review_notes="$(read_field review_notes)"

if (( ${#name} < 2 || ${#name} > 30 )); then
  echo "App Store name must contain 2-30 characters" >&2
  exit 1
fi
if (( ${#subtitle} > 30 )); then
  echo "App Store subtitle exceeds 30 characters" >&2
  exit 1
fi
if (( ${#description} > 4000 )); then
  echo "App Store description exceeds 4000 characters" >&2
  exit 1
fi
keyword_bytes="$(LC_ALL=C printf '%s' "$keywords" | wc -c | tr -d '[:space:]')"
if (( keyword_bytes > 100 )); then
  echo "App Store keywords exceed 100 UTF-8 bytes" >&2
  exit 1
fi
IFS=',' read -r -a keyword_values <<<"$keywords"
for keyword in "${keyword_values[@]}"; do
  keyword="${keyword#"${keyword%%[![:space:]]*}"}"
  keyword="${keyword%"${keyword##*[![:space:]]}"}"
  if (( ${#keyword} < 3 )); then
    echo "Every App Store keyword must contain more than two characters" >&2
    exit 1
  fi
done

[[ "$support_url" == "https://ok200.app/support" ]] || {
  echo "Unexpected support URL" >&2
  exit 1
}
[[ "$marketing_url" == "https://ok200.app/" ]] || {
  echo "Unexpected marketing URL" >&2
  exit 1
}
[[ "$privacy_url" == "https://ok200.app/privacy" ]] || {
  echo "Unexpected privacy URL" >&2
  exit 1
}
for expected_review_phrase in \
  'plain HTTP' \
  'foreground' \
  'read-only' \
  'There is no account'; do
  rg -F -q "$expected_review_phrase" <<<"$review_notes" || {
    echo "Review notes are missing required behavior: $expected_review_phrase" >&2
    exit 1
  }
done
rg -F -q 'No, we do not collect data from this app.' "$store_root/app-privacy.md"
rg -F -q 'Unrestricted Web Access' "$store_root/age-rating.md"

check_screenshot_group() {
  local group="$1"
  shift
  local allowed_dimensions=("$@")
  local group_dir="$store_root/screenshots/$group"
  local screenshots=()
  local dimensions=""

  if [[ -d "$group_dir" ]]; then
    while IFS= read -r -d '' screenshot; do
      screenshots+=("$screenshot")
    done < <(find "$group_dir" -maxdepth 1 -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' \) -print0)
  fi

  if [[ ${#screenshots[@]} -eq 0 ]]; then
    if [[ "$require_screenshots" == true ]]; then
      echo "Missing required $group App Store screenshots" >&2
      exit 1
    fi
    echo "screenshots_$group=pending"
    return
  fi
  if (( ${#screenshots[@]} > 10 )); then
    echo "$group contains more than ten App Store screenshots" >&2
    exit 1
  fi

  for screenshot in "${screenshots[@]}"; do
    properties="$(sips -g pixelWidth -g pixelHeight -g hasAlpha "$screenshot")"
    width="$(sed -n 's/.*pixelWidth: //p' <<<"$properties")"
    height="$(sed -n 's/.*pixelHeight: //p' <<<"$properties")"
    current_dimensions="${width}x${height}"
    if [[ " ${allowed_dimensions[*]} " != *" $current_dimensions "* ]]; then
      echo "Unexpected $group screenshot dimensions: $current_dimensions" >&2
      exit 1
    fi
    if rg -q 'hasAlpha: yes' <<<"$properties"; then
      echo "App Store screenshot contains an alpha channel: $(basename "$screenshot")" >&2
      exit 1
    fi
    if [[ -n "$dimensions" && "$current_dimensions" != "$dimensions" ]]; then
      echo "$group screenshots must use one consistent accepted size" >&2
      exit 1
    fi
    dimensions="$current_dimensions"
  done
  echo "screenshots_$group=${#screenshots[@]}@$dimensions"
}

check_screenshot_group iphone-6.9 \
  1260x2736 2736x1260 \
  1290x2796 2796x1290 \
  1320x2868 2868x1320
check_screenshot_group ipad-13 \
  2064x2752 2752x2064 \
  2048x2732 2732x2048

echo "App Store metadata field limits and disclosure drafts passed"
