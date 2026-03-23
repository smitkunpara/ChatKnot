import fs from 'node:fs';
import path from 'node:path';

describe('Android backup policy', () => {
  it('disables OS-level app backup in AndroidManifest', () => {
    const manifestPath = path.resolve(
      process.cwd(),
      'android',
      'app',
      'src',
      'main',
      'AndroidManifest.xml'
    );
    const manifest = fs.readFileSync(manifestPath, 'utf8');

    const applicationTagMatch = manifest.match(/<application\b[^>]*>/);
    expect(applicationTagMatch).toBeTruthy();

    const applicationTag = applicationTagMatch?.[0] ?? '';
    expect(applicationTag).toContain('android:allowBackup="false"');
  });
});
