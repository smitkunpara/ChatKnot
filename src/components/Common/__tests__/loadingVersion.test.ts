import { resolveStartupVersion } from '../loadingVersion';

describe('resolveStartupVersion', () => {
  it('prefers expoConfig version when available', () => {
    const version = resolveStartupVersion(
      {
        expoConfig: { version: '1.2.3' },
        nativeAppVersion: '9.9.9',
      },
      '0.4.1'
    );

    expect(version).toBe('1.2.3');
  });

  it('falls back to manifest2 expoClient version', () => {
    const version = resolveStartupVersion(
      {
        manifest2: { extra: { expoClient: { version: '2.0.0' } } },
      },
      '0.4.1'
    );

    expect(version).toBe('2.0.0');
  });

  it('falls back to legacy manifest version and trims whitespace', () => {
    const version = resolveStartupVersion(
      {
        expoConfig: { version: '   ' },
        manifest: { version: ' 3.1.4  ' },
      },
      '0.4.1'
    );

    expect(version).toBe('3.1.4');
  });

  it('falls back to native app version when manifest values are unavailable', () => {
    const version = resolveStartupVersion(
      {
        nativeAppVersion: '4.5.6',
      },
      '0.4.1'
    );

    expect(version).toBe('4.5.6');
  });

  it('returns provided fallback when all sources are empty', () => {
    const version = resolveStartupVersion(
      {
        expoConfig: { version: '' },
        manifest2: { extra: { expoClient: { version: '   ' } } },
        manifest: { version: null },
        nativeAppVersion: undefined,
      },
      '0.4.1'
    );

    expect(version).toBe('0.4.1');
  });
});
