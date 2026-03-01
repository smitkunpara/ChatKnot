# Release Build Commands

This project is aligned to release version `0.2.0-beta` with build number/code `2`.

## Pre-release checks

```bash
npm test
```

or

```bash
npm run version:check
```

## Android release artifacts

Build signed/unsigned (based on Gradle signing config) release APK:

```bash
npm run android:apk:release
```

Expected output path:

`android/app/build/outputs/apk/release/app-release.apk`

Build release AAB:

```bash
npm run android:aab:release
```

Expected output path:

`android/app/build/outputs/bundle/release/app-release.aab`

## Dry-run task validation

To verify release task graph without executing the full build:

```bash
cd android && ./gradlew --no-daemon -m assembleRelease
```
