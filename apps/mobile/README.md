# Multica Mobile (iOS)

Expo + React Native iOS client for Multica. Independent from web/desktop — shares only types from `@multica/core/`. See [`CLAUDE.md`](./CLAUDE.md) for the locked tech-stack baseline and import rules.

## Just want to use it on your phone? (no development)

Multica isn't on the App Store yet — until that changes, anyone who wants it on their iPhone builds from source. One command:

```bash
pnpm ios:mobile:device:prod:release
```

This connects to the same backend as `multica.ai`, so your existing account just works.

**Prerequisites**: Mac with Xcode, a free Apple ID added under Xcode → Settings → Accounts, iPhone connected via USB with [Developer Mode enabled](https://docs.expo.dev/guides/ios-developer-mode/). Walk through Expo's [Set up your environment](https://docs.expo.dev/get-started/set-up-your-environment/) (pick **Development build → iOS Device**) if any of that is missing.

Xcode signs the build with the "Personal Team" your Apple ID automatically owns — created silently the first time you signed into Xcode, no setup needed. The first build downloads CocoaPods + compiles React Native from source — expect 10–20 minutes. Subsequent builds reuse Xcode's cache.

**If Xcode rejects signing with "No matching provisioning profiles found"** — rare, happens if someone has claimed the default bundle id `ai.multica.mobile` on Apple's developer portal. Pick any reverse-domain you own and re-run:

```bash
export EXPO_BUNDLE_IDENTIFIER_PROD=com.yourname.multica
pnpm ios:mobile:device:prod:release
```

**7-day signing limit**: a free Apple ID signs builds for 7 days. After that, plug back into the Mac and re-run the command to re-sign. An Apple Developer Program account ($99/yr) extends this to 1 year.

Everything below is for app developers — you can ignore the rest if you only wanted a personal install.

## Scripts

| Command | What it does | Backend |
|---|---|---|
| `pnpm dev:mobile` | Metro only (reuse existing install) | local (`.env.development.local`) |
| `pnpm dev:mobile:staging` | Metro only (reuse existing install) | staging (`.env.staging`) |
| `pnpm dev:mobile:prod` | Metro only (reuse existing install) | production (`.env.production`) |
| `pnpm ios:mobile` | Full rebuild + install on **iOS Simulator**, Debug | local |
| `pnpm ios:mobile:staging` | Full rebuild + install on **iOS Simulator**, Debug | staging |
| `pnpm ios:mobile:prod` | Full rebuild + install on **iOS Simulator**, Debug | production |
| `pnpm ios:mobile:device` | Full rebuild + install on **USB iPhone**, Debug | local |
| `pnpm ios:mobile:device:staging` | Full rebuild + install on **USB iPhone**, Debug | staging |
| `pnpm ios:mobile:device:staging:release` | Full rebuild + install on **USB iPhone**, Release (standalone) | staging |
| `pnpm ios:mobile:device:prod` | Full rebuild + install on **USB iPhone**, Debug | production |
| `pnpm ios:mobile:device:prod:release` | Full rebuild + install on **USB iPhone**, Release (standalone) | production |
| `pnpm ios:mobile:testflight` | Release archive + upload to **TestFlight** (paid team, no USB) | production |

`dev:*` runs Metro only — assumes the matching variant is already installed. `ios:mobile*` does a full native rebuild + install.

Bundle id and display name switch on `APP_ENV` (see `app.config.ts`), so Dev / Staging / Production variants can coexist on the same device or simulator.

## First-time setup

`.env.staging` is committed (public staging URL). `.env.development.local` is gitignored — copy the template once:

```bash
cp apps/mobile/.env.example apps/mobile/.env.development.local
# then edit EXPO_PUBLIC_API_URL inside it to your Mac's LAN IP, e.g. http://192.168.1.42:8080
```

If your Apple ID isn't on the Multica Apple Developer team yet, also uncomment and set `EXPO_BUNDLE_IDENTIFIER_DEV` to a reverse-domain you own (e.g. `com.yourname.multica.dev`). This **only** overrides the dev variant — staging / production bundle ids are intentionally not overridable so variants can coexist.

## Build it onto your iPhone

Two paths, depending on what you want to do:

### Day-to-day development (Mac in front of you)

```bash
pnpm ios:mobile:device:staging
```

Produces a **Debug build** with `expo-dev-launcher` embedded. Every launch the app probes Metro on your Mac and pulls fresh JS — perfect for hot-reload, painful when the Mac is asleep or you're on a different WiFi.

### Standalone / "just use it" (walk away from the Mac)

```bash
pnpm ios:mobile:device:staging:release
```

Produces a **Release build**. No `expo-dev-launcher`, no Metro probe, no "Downloading…" screen. Splash → app, exactly like an App Store install. Trade-off: every JS change requires re-running this command.

Both paths share the same prerequisites: Mac with Xcode, free Apple ID added under Xcode → Settings → Accounts, iPhone connected via USB with Developer Mode enabled. Follow Expo's [Set up your environment](https://docs.expo.dev/get-started/set-up-your-environment/) — pick **Development build → iOS Device** — if any of that is missing.

First build of either variant downloads CocoaPods + compiles React Native from source — expect 10-20 minutes. Subsequent builds reuse Xcode's DerivedData cache.

## Try it in the iOS Simulator (no iPhone needed)

```bash
pnpm ios:mobile:staging
```

Boots the simulator, builds, installs the dev-client. Faster to iterate than a device build because no signing / provisioning step. Same `dev:mobile:staging` Metro flow afterward.

## 7-day signing limit (device only)

A free Apple ID signs builds for **7 days only**, Debug and Release both. After that the app refuses to launch on the iPhone. Plug back into the Mac and re-run the corresponding `ios:mobile:device*` script to re-sign. Simulator builds are unaffected. The only workaround for the device limit is an Apple Developer Program account ($99/yr), which extends to 1 year — and unlocks TestFlight, below.

## Distribute via TestFlight

For anyone with an Apple Developer Program team: this replaces USB installs entirely. Testers install from the TestFlight app, builds last 90 days, and nobody needs a Mac.

```bash
APPLE_TEAM_ID=ABCDE12345 ASC_KEY_ID=XXXXXXXXXX ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
  pnpm ios:mobile:testflight
```

That archives the production variant with the team's Apple Distribution certificate and uploads it straight to App Store Connect (`xcodebuild -exportArchive` with `destination=upload` — no fastlane, no EAS, no Transporter step).

**One-time setup.** All three steps are browser work, and the order matters — each one needs the previous one to exist:

1. **Register the explicit App ID** — [Certificates, Identifiers & Profiles → Identifiers](https://developer.apple.com/account/resources/identifiers) → **+** → App IDs → App, Bundle ID **Explicit** = `ai.multica.mobile`. This has to come first because the New App form in step 2 only offers Bundle IDs that already exist ([register an App ID](https://developer.apple.com/help/account/identifiers/register-an-app-id)).
2. **Create the app record** — [App Store Connect → Apps → **+** → New App](https://appstoreconnect.apple.com/apps). Platform iOS, pick the Bundle ID from step 1, and an SKU of your choosing. No CLI equivalent exists: the App Store Connect API is [read/update only for app records](https://developer.apple.com/documentation/appstoreconnectapi/apps) — *"Don't use this API to create new apps; instead, create new apps on the App Store Connect website."*
3. **Create an App Store Connect API key** — Users and Access → Integrations → **Team Keys** → **+**, role **Admin**. Two things about that role choice: it must be a *team* key, because [individual keys can't use the provisioning endpoints](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api) that `-allowProvisioningUpdates` needs; and **App Manager is not enough** — in Apple's [role matrix](https://developer.apple.com/support/roles/) every provisioning row for App Manager is conditional on separate Certificates, Identifiers & Profiles access, which the team-key UI has no way to grant. Admin and Account Holder have it unconditionally. Apple lets you download the `.p8` exactly once — put it at `~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8` (or point `ASC_KEY_PATH` at it). Note the Key ID and the Issuer ID shown on that page.

Two account-level gates can block the above regardless of order: the Account Holder has to [request API access](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/) before any key can be generated, and "you can't add an app to your account until the Account Holder signs the latest agreement in the Business section."

After the first upload, answer the **export-compliance** question on the build in App Store Connect, then add testers under TestFlight → Internal (or External) Testing.

**Build numbers** are read from App Store Connect — the script takes the highest build number the app already has and adds one, so uploads can never collide. That query runs before the native build, which also means a bad key or a missing app record fails in seconds instead of after a 20-minute compile. Override with `IOS_BUILD_NUMBER=42`. Marketing version comes from `version` in `app.config.ts`.

The script refuses to run with uncommitted changes to tracked files, so every TestFlight build corresponds to a commit; `ALLOW_DIRTY=1` overrides for throwaway builds. It always does a clean prebuild, because dev / staging / production use different bundle ids and Expo [requires `--clean` when switching variants](https://docs.expo.dev/build-reference/variants/) — a reused `ios/` can otherwise archive the wrong app.

Expect 10–20 minutes per release (clean prebuild = CocoaPods + React Native from source), plus 5–15 minutes of Apple-side processing before the build shows up in TestFlight.

## Pointing at a different backend

Edit `EXPO_PUBLIC_API_URL` in `.env.staging`, `.env.production`, or `.env.development.local` (whichever variant you're running). Then:

- For an installed **Debug build**: restart Metro (`pnpm dev:mobile:staging`) so the next JS bundle picks up the new value.
- For an installed **Release build**: re-run the `ios:mobile:device:staging:release` command — the value is baked into the embedded bundle at build time.

For local backend testing, use your Mac's LAN IP (`ipconfig getifaddr en0`), not `localhost`.
