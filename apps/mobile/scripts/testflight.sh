#!/usr/bin/env bash
set -euo pipefail

# ==========================================================================
# Build the production iOS app and upload it to TestFlight.
#
# Usage: pnpm ios:mobile:testflight
#
# Unlike the `ios:mobile:device*` scripts (free-Apple-ID signing, 7-day
# builds, USB install), this one signs with the paid Apple Developer team's
# Apple Distribution certificate and hands the archive to App Store Connect,
# which is what makes builds installable over the air for 90 days via
# TestFlight.
#
# Required env (see README "Distribute via TestFlight"):
#   APPLE_TEAM_ID   10-char team id, e.g. ABCDE12345
#   ASC_KEY_ID      App Store Connect API *team* key id
#   ASC_ISSUER_ID   App Store Connect API issuer id (one per team)
# Optional env:
#   ASC_KEY_PATH    path to AuthKey_<ASC_KEY_ID>.p8
#                   (default ~/.appstoreconnect/private_keys/AuthKey_<id>.p8)
#   IOS_BUILD_NUMBER  override CFBundleVersion; by default it is derived from
#                   what App Store Connect already has (highest + 1)
#   ALLOW_DIRTY=1   release from a dirty working tree (debugging only)
# ==========================================================================

MOBILE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$MOBILE_DIR"

# CocoaPods aborts with "Unicode Normalization not appropriate for ASCII-8BIT"
# when the shell has no UTF-8 locale — common in non-interactive/CI shells.
export LANG="${LANG:-en_US.UTF-8}"

# ---------- Preflight ----------
missing=()
[ -n "${APPLE_TEAM_ID:-}" ] || missing+=("APPLE_TEAM_ID")
[ -n "${ASC_KEY_ID:-}" ] || missing+=("ASC_KEY_ID")
[ -n "${ASC_ISSUER_ID:-}" ] || missing+=("ASC_ISSUER_ID")
if [ ${#missing[@]} -gt 0 ]; then
  echo "✗ Missing required env: ${missing[*]}"
  echo "  See apps/mobile/README.md → 'Distribute via TestFlight'."
  exit 1
fi

ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"
export ASC_KEY_PATH
if [ ! -f "$ASC_KEY_PATH" ]; then
  echo "✗ App Store Connect API key not found: $ASC_KEY_PATH"
  echo "  Create an Admin-role *team* key under App Store Connect → Users and"
  echo "  Access → Integrations → Team Keys, then move the .p8 there (Apple"
  echo "  lets you download a key exactly once)."
  exit 1
fi

command -v xcodebuild >/dev/null 2>&1 || { echo "✗ xcodebuild not found — install Xcode."; exit 1; }

# A build number identifies a commit to everyone reading TestFlight later, so
# refuse to upload a working tree that no commit describes. Untracked files are
# fine — .env.development.local and ios/ live there.
if [ "${ALLOW_DIRTY:-}" != "1" ] && ! git diff --quiet HEAD --; then
  echo "✗ Working tree has uncommitted changes to tracked files."
  echo "  Commit them first, or set ALLOW_DIRTY=1 for a throwaway build."
  git status --short --untracked-files=no
  exit 1
fi

BUNDLE_ID="${EXPO_BUNDLE_IDENTIFIER_PROD:-ai.multica.mobile}"

# Ask App Store Connect for the next free build number. Doing this before the
# 20-minute native build also surfaces a bad key or a missing app record early.
if [ -z "${IOS_BUILD_NUMBER:-}" ]; then
  IOS_BUILD_NUMBER="$(node scripts/next-build-number.mjs "$BUNDLE_ID")"
fi
export IOS_BUILD_NUMBER

BUILD_DIR="$MOBILE_DIR/.testflight"
ARCHIVE_PATH="$BUILD_DIR/Multica.xcarchive"
EXPORT_OPTIONS="$BUILD_DIR/ExportOptions.plist"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "→ commit        $(git rev-parse --short HEAD)"
echo "→ bundle id     $BUNDLE_ID"
echo "→ team          $APPLE_TEAM_ID"
echo "→ build number  $IOS_BUILD_NUMBER"

# xcodebuild needs these on both the archive and the export call.
# -allowProvisioningUpdates lets it create and renew the App Store distribution
# profile itself, which is why the key has to be an Admin-role *team* key:
# individual keys can't call the provisioning endpoints at all, and App Manager
# only reaches them via a separate Certificates/Identifiers/Profiles grant that
# team keys have no way to carry.
AUTH_ARGS=(
  -allowProvisioningUpdates
  -authenticationKeyPath "$ASC_KEY_PATH"
  -authenticationKeyID "$ASC_KEY_ID"
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"
)

# ---------- Generate the native project ----------
# --clean is not optional here: dev / staging / production carry different
# bundle ids, and Expo requires a clean prebuild when switching variants
# (https://docs.expo.dev/build-reference/variants/). A reused ios/ from a
# staging run would archive the wrong app. Costs a CocoaPods install and a
# React Native compile from source — 10-20 minutes.
# `expo` resolves via node_modules/.bin because this script only ever runs
# through `pnpm ios:testflight`.
expo prebuild --platform ios --clean

# ---------- Archive ----------
xcodebuild \
  -workspace ios/Multica.xcworkspace \
  -scheme Multica \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  "${AUTH_ARGS[@]}" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  archive

# ---------- Upload ----------
# destination=upload makes -exportArchive hand the build straight to App Store
# Connect, so there is no separate altool/Transporter step. Keeping
# manageAppVersionAndBuildNumber off preserves IOS_BUILD_NUMBER as-is.
cat > "$EXPORT_OPTIONS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>${APPLE_TEAM_ID}</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$BUILD_DIR/export" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  "${AUTH_ARGS[@]}"

echo ""
echo "✓ Uploaded build $IOS_BUILD_NUMBER of $BUNDLE_ID to App Store Connect."
echo "  Apple processes it for 5-15 minutes, then it appears under"
echo "  TestFlight → iOS builds. First build of a new app also needs the"
echo "  export-compliance question answered once in App Store Connect."
