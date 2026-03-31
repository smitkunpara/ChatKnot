#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const expectedVersion = process.argv[2] ?? '0.4.2';
const expectedBuild = process.argv[3] ?? '10';

function readRelativeFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function extractSingleMatch(content, regex, label) {
  const match = content.match(regex);
  if (!match) {
    fail(`Could not find ${label}.`);
  }
  return match[1].trim();
}

const mismatches = [];

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    mismatches.push(`${label}: expected \"${expected}\", found \"${actual}\"`);
  }
}

const packageJson = JSON.parse(readRelativeFile('package.json'));
assertEqual('package.json version', packageJson.version, expectedVersion);

const appJson = JSON.parse(readRelativeFile('app.json'));
assertEqual('app.json expo.version', appJson.expo?.version, expectedVersion);
assertEqual('app.json expo.android.versionCode', String(appJson.expo?.android?.versionCode), expectedBuild);

const buildGradle = readRelativeFile('android/app/build.gradle');
const androidVersionName = extractSingleMatch(buildGradle, /versionName\s+\"([^\"]+)\"/, 'android versionName');
const androidVersionCode = extractSingleMatch(buildGradle, /versionCode\s+(\d+)/, 'android versionCode');
assertEqual('android/app/build.gradle versionName', androidVersionName, expectedVersion);
assertEqual('android/app/build.gradle versionCode', androidVersionCode, expectedBuild);

if (mismatches.length > 0) {
  console.error('Version consistency check failed:');
  for (const mismatch of mismatches) {
    console.error(`- ${mismatch}`);
  }
  process.exit(1);
}

console.log(
  `Version consistency check passed for version ${expectedVersion} and build ${expectedBuild}.`
);
