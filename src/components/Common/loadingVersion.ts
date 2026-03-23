interface ExpoConfigLike {
  version?: string | null;
}

interface ManifestLike {
  version?: string | null;
}

interface Manifest2Like {
  extra?: {
    expoClient?: {
      version?: string | null;
    };
  };
}

export interface StartupVersionSource {
  expoConfig?: ExpoConfigLike | null;
  manifest?: ManifestLike | null;
  manifest2?: Manifest2Like | null;
  nativeAppVersion?: string | null;
}

const firstNonEmpty = (values: Array<string | null | undefined>): string | undefined =>
  values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim();

export const resolveStartupVersion = (
  source: StartupVersionSource,
  fallbackVersion: string
): string =>
  firstNonEmpty([
    source.expoConfig?.version,
    source.manifest2?.extra?.expoClient?.version,
    source.manifest?.version,
    source.nativeAppVersion,
  ]) ?? fallbackVersion;
