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
#   IOS_BUILD_NUMBER  CFBundleVersion; must be unique per upload for a given
#                   marketing version (default: commit count on HEAD)
#   PREBUILD_CLEAN=1  regenerate ios/ from scratch before building
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
if [ ! -f "$ASC_KEY_PATH" ]; then
  echo "✗ App Store Connect API key not found: $ASC_KEY_PATH"
  echo "  Download it once from App Store Connect → Users and Access →"
  echo "  Integrations → Team Keys, then move it there (Apple lets you"
  echo "  download a key exactly once)."
  exit 1
fi

command -v xcodebuild >/dev/null 2>&1 || { echo "✗ xcodebuild not found — install Xcode."; exit 1; }

BUNDLE_ID="${EXPO_BUNDLE_IDENTIFIER_PROD:-ai.multica.mobile}"
# Commit count is monotonic and reproducible, so re-running this script on the
# same commit re-uploads the same build number (App Store Connect rejects the
# duplicate instead of silently shipping two different binaries as one build).
IOS_BUILD_NUMBER="${IOS_BUILD_NUMBER:-$(git rev-list --count HEAD)}"
export IOS_BUILD_NUMBER

BUILD_DIR="$MOBILE_DIR/.testflight"
ARCHIVE_PATH="$BUILD_DIR/Multica.xcarchive"
EXPORT_OPTIONS="$BUILD_DIR/ExportOptions.plist"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "→ bundle id     $BUNDLE_ID"
echo "→ team          $APPLE_TEAM_ID"
echo "→ build number  $IOS_BUILD_NUMBER"

# ---------- Generate the native project ----------
# ios/ is gitignored generated output, so every release run regenerates it from
# app.config.ts. First run downloads CocoaPods and compiles React Native from
# source — 10-20 minutes.
PREBUILD_ARGS=(--platform ios)
[ "${PREBUILD_CLEAN:-}" = "1" ] && PREBUILD_ARGS+=(--clean)
# `expo` resolves via node_modules/.bin because this script only ever runs
# through `pnpm ios:testflight`.
expo prebuild "${PREBUILD_ARGS[@]}"

# ---------- Archive ----------
# -allowProvisioningUpdates + the three -authenticationKey* flags let xcodebuild
# register the bundle id and create/renew the App Store distribution profile on
# its own. That is the whole reason this path needs a *team* key: individual
# App Store Connect keys can't touch the provisioning endpoints.
xcodebuild \
  -workspace ios/Multica.xcworkspace \
  -scheme Multica \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$ASC_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
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
  -allowProvisioningUpdates \
  -authenticationKeyPath "$ASC_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"

echo ""
echo "✓ Uploaded build $IOS_BUILD_NUMBER of $BUNDLE_ID to App Store Connect."
echo "  Apple processes it for 5-15 minutes, then it appears under"
echo "  TestFlight → iOS builds. First build of a new app also needs the"
echo "  export-compliance question answered once in App Store Connect."
