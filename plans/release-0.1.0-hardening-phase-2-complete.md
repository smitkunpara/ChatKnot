## Phase 2 Complete: Release Version 0.1.0 Alignment and Build Scripts

Aligned release version metadata to `0.1.0` across JS/Expo/Android/iOS and added deterministic Android release scripts. Added an executable version consistency check and verified it passes along with release task-graph validation.

**Files created/changed:**
- package.json
- app.json
- android/app/build.gradle
- ios/mcpconnectorapp/Info.plist
- ios/mcpconnectorapp.xcodeproj/project.pbxproj
- scripts/check-version-consistency.mjs
- docs/release.md
- plans/release-0.1.0-hardening-phase-2-complete.md

**Functions created/changed:**
- `main()` in scripts/check-version-consistency.mjs
- `parseJsonFile()` in scripts/check-version-consistency.mjs
- `extractAndroidVersionName()` in scripts/check-version-consistency.mjs
- `extractIosVersions()` in scripts/check-version-consistency.mjs
- `extractXcodeMarketingVersions()` in scripts/check-version-consistency.mjs

**Tests created/changed:**
- Version consistency executable check: `scripts/check-version-consistency.mjs`
- Verified via `npm test` (mapped to version consistency check)

**Review Status:** APPROVED

**Git Commit Message:**
chore: align app version to 0.1.0

- Update package, Expo, Android, and iOS version metadata
- Add Android release APK/AAB build scripts and release docs
- Add executable version consistency check used by npm test
