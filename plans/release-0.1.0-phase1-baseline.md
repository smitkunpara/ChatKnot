# Phase 1 Baseline Note (Release 0.1.0 Hardening)

Date: 2026-02-22
Branch: `feature/release-0.1.0-hardening`

## Scope
Preflight baseline build before source changes, branch creation, and checkpoint status capture.

## Git Preflight
Commands run:

```bash
git branch --show-current && git status --short --branch
```

Result:
- Current branch before phase work: `master`
- Working tree status before phase work: `## master` with untracked `plans/`

Branch command run:

```bash
git switch feature/release-0.1.0-hardening || git switch -c feature/release-0.1.0-hardening
```

Result:
- Branch did not exist, created and switched to `feature/release-0.1.0-hardening`

## Required Baseline Builds
1) Debug build command:

```bash
cd android && ./gradlew :app:assembleDebug
```

Outcome:
- `BUILD SUCCESSFUL in 31s`
- `367 actionable tasks: 59 executed, 308 up-to-date`

Notable warnings/messages:
- `NODE_ENV` not set; Expo uses `.env.local` and `.env`
- CXX5304 warning about `build-tools;29.0.3` duplicate/inconsistent location with `android-sdk-local/build-tools/debian`
- Gradle deprecation warning: incompatible with Gradle 9.0 in future

2) Release build command (first attempt):

```bash
cd android && ./gradlew :app:assembleRelease
```

Outcome:
- Failed due terminal cwd persistence (`bash: cd: android: No such file or directory`)

Retry command:

```bash
pwd && ./gradlew :app:assembleRelease
```

Outcome:
- Ran from `/home/smitkunpara/Desktop/smit/mcp-connector-app/android`
- `BUILD SUCCESSFUL in 9m 7s`
- `563 actionable tasks: 517 executed, 46 up-to-date`

Notable warnings/messages:
- `NODE_ENV` not set; Expo uses `.env.local` and `.env`
- Android manifest namespace/package warnings in dependencies
- Multiple deprecation/unchecked warnings from React Native/Expo dependency modules
- Gradle deprecation warning: incompatible with Gradle 9.0 in future
- Problems report generated:
  - `android/build/reports/problems/problems-report.html`

## Artifacts
Artifact listing command:

```bash
pwd && ls -l app/build/outputs/apk/debug app/build/outputs/apk/release
```

Artifacts found:
- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Release APK: `android/app/build/outputs/apk/release/app-release.apk`
- Metadata files:
  - `android/app/build/outputs/apk/debug/output-metadata.json`
  - `android/app/build/outputs/apk/release/output-metadata.json`

## Checkpoint Notes
- No source feature edits performed in Phase 1.
- Pre-existing uncommitted content existed before phase start (`plans/` untracked).
- Checkpoint commit remains pending and will be executed by the conductor in the designated step.
- This note records baseline build status for Atlas checkpoint handling (no commit performed by this agent).
