export const shouldShowStartupWarnings = (warnings: string[]): boolean =>
	warnings.some((warning) => warning.trim().length > 0);
