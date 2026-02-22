# MCP Connector App

A React Native (Expo bare workflow) mobile app for chatting with LLM providers and connecting MCP/OpenAPI tools.

## What This App Does

- Chat with configured AI providers (OpenAI-compatible endpoints)
- Connect MCP servers and OpenAPI endpoints for tool calling
- Manage provider models with visibility controls (eye toggle)
- Persist chat/settings locally with hardened storage setup
- Validate MCP OpenAPI endpoints before save

## Key Features

- Multi-provider AI setup (custom OpenAI-compatible)
- Global last-used model memory
- Model visibility control from Settings
- IST-based chat sidebar labels
- Settings draft edit/save flow (no accidental autosave while editing)
- OpenAPI save-time validation with actionable errors
- MCP tool collision handling across multiple servers

## Tech Stack

- React Native `0.81.5`
- Expo `~54.0.33` (bare workflow)
- Zustand for app state
- Encrypted state storage + secure vault foundation
- Android Gradle build for release artifacts

## Project Structure

- `src/screens/` app screens (`ChatScreen`, `SettingsScreen`)
- `src/components/` UI components
- `src/store/` Zustand stores
- `src/services/llm/` LLM provider and model selection logic
- `src/services/mcp/` MCP/OpenAPI connectivity and validation
- `src/services/storage/` secure/encrypted storage helpers
- `android/` native Android project
- `ios/` native iOS project

## Prerequisites

- Node.js 18+
- npm 9+
- Java 17 (recommended for Android build toolchain)
- Android SDK + platform tools
- For iOS builds: Xcode and CocoaPods (macOS only)

## Install

```bash
npm install
```

## Run (Development)

```bash
npm start
npm run android
npm run ios
```

## Testing

Unit tests:

```bash
npm run test:unit
```

Full test command (includes version consistency check):

```bash
npm test
```

## Versioning

Current release target in this branch:

- App/package version: `0.1.0`
- Android versionName: `0.1.0`

Consistency check:

```bash
npm run version:check
```

## Configure AI Providers

In **Settings -> AI Providers**:

1. Add provider name
2. Add base URL (OpenAI-compatible)
3. Add API key
4. Fetch/select model
5. Use eye toggles to control which models are visible in chat

Behavior:

- If provider/API/model is not configured, chat shows a clear setup error
- No hardcoded model is forced
- First visible configured model is auto-selected when needed

## Configure MCP Servers

In **Settings -> MCP Servers**:

1. Add server name + URL
2. Add one or multiple headers (if needed)
3. Save

Save-time validation:

- Tries `<base-url>/openapi.json`
- Supports direct `openapi.json` URL
- Validates essential OpenAPI fields:
  - `openapi`/`swagger`
  - `info.title`
  - `info.version`
  - non-empty `paths`
  - callable operations available

If invalid, save is blocked and actionable validation errors are shown.

## Data & Security Notes

- Security hardening foundations are implemented for local persistence.
- Android backup is disabled in manifest for stronger local data protection.
- Release builds require explicit signing config.

## Build Android Release

APK:

```bash
npm run android:apk:release
```

AAB:

```bash
npm run android:aab:release
```

### Release Signing Required

Release build enforces signing credentials. Provide either:

- `android/key.properties` (see `android/key.properties.example`)
- or environment variables:
  - `RELEASE_STORE_FILE`
  - `RELEASE_STORE_PASSWORD`
  - `RELEASE_KEY_ALIAS`
  - `RELEASE_KEY_PASSWORD`

If missing, release build fails with a clear error (expected behavior).

## Common Commands

```bash
npm run version:check
npm run test:unit
npm test
npm run android:apk:release
npm run android:aab:release
```

## Troubleshooting

- Model list empty:
  - verify provider `baseUrl`, API key, and model visibility toggles
- MCP save failing:
  - check endpoint URL and OpenAPI JSON validity
  - provide required auth headers
- Release build failing:
  - confirm signing credentials are set correctly

## Current Branch Notes

This branch contains release-hardening + UX updates for `0.1.0`.
If you plan to ship to Play Store, build AAB with production keystore credentials.
