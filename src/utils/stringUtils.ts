export const normalize = (value: string | undefined | null): string => (value || '').trim();

// Alias used throughout the codebase for settings/model selection comparisons.
export const normalizeSettingValue = normalize;

