#!/usr/bin/env node
/**
 * Print the next CFBundleVersion to use for a TestFlight upload.
 *
 * App Store Connect rejects a build number it has already seen for a given
 * marketing version, and it is the only system that knows what has actually
 * been uploaded — anything derived locally (commit count, tag count) collides
 * the moment history is rewritten, e.g. a squash merge lands the PR's changes
 * as a new commit with the same count. So ask App Store Connect: take the
 * highest build number the app has and add one.
 *
 * Doubles as a preflight for scripts/testflight.sh — it fails fast, before a
 * 20-minute native build, when the key is wrong or the app record is missing.
 *
 * Usage: node scripts/next-build-number.mjs <bundle-id>
 *   env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH
 * Writes the number to stdout; everything else goes to stderr.
 */

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const API = "https://api.appstoreconnect.apple.com/v1";

const bundleId = process.argv[2];
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;
if (!bundleId || !ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_PATH) {
  console.error(
    "usage: next-build-number.mjs <bundle-id> (needs ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH)",
  );
  process.exit(2);
}

const b64url = (input) =>
  Buffer.from(input).toString("base64url");

/**
 * App Store Connect wants an ES256 JWT whose signature is the raw r||s pair
 * (JOSE), not the DER encoding Node emits by default — hence dsaEncoding.
 * Apple caps token lifetime at 20 minutes. `iss` is the team-key form of the
 * claim; individual keys use `sub: "user"` instead, but they can't do the
 * provisioning work the release needs, so this path only supports team keys.
 */
function token() {
  const header = { alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ASC_ISSUER_ID,
    iat: now,
    exp: now + 15 * 60,
    aud: "appstoreconnect-v1",
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createSign("SHA256")
    .update(signingInput)
    .sign({
      key: readFileSync(ASC_KEY_PATH),
      dsaEncoding: "ieee-p1363",
    })
    .toString("base64url");
  return `${signingInput}.${signature}`;
}

const jwt = token();

async function get(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) {
      throw new Error(
        `App Store Connect rejected the API key (401). Check ASC_KEY_ID / ASC_ISSUER_ID and that ${ASC_KEY_PATH} is the matching .p8.`,
      );
    }
    throw new Error(`GET ${path} → ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json();
}

async function main() {
  const apps = await get(
    `/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&fields[apps]=bundleId`,
  );
  const app = apps.data?.[0];
  if (!app) {
    throw new Error(
      `No App Store Connect app record for ${bundleId}.\n` +
        `  Create it at https://appstoreconnect.apple.com/apps → + → New App.\n` +
        `  The bundle id must already be registered as an explicit App ID at\n` +
        `  https://developer.apple.com/account/resources/identifiers — the New App\n` +
        `  form only offers App IDs that already exist.`,
    );
  }

  // `version` on a build resource is CFBundleVersion (the build number);
  // CFBundleShortVersionString lives on the related preReleaseVersion. Sorting
  // is lexicographic on a string field, so pull a page and max() numerically
  // instead of trusting sort=-version.
  const builds = await get(
    `/builds?filter[app]=${app.id}&fields[builds]=version&limit=200`,
  );
  const highest = (builds.data ?? []).reduce((max, b) => {
    const n = Number.parseInt(b.attributes?.version ?? "", 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  console.error(
    `→ App Store Connect: app ${app.id}, ${builds.data?.length ?? 0} known build(s), highest ${highest}`,
  );
  console.log(String(highest + 1));
}

// Credential, connectivity and missing-app-record failures are expected
// operator errors, not crashes — report them as one line, not a stack trace.
main().catch((err) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
