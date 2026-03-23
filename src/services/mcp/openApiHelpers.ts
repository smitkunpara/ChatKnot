export const ensureHttpUrl = (rawUrl: string): string => {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

export const extractSecuritySchemeNames = (security: unknown): string[] => {
  if (!Array.isArray(security)) return [];
  const names: string[] = [];
  for (const entry of security) {
    if (!entry || typeof entry !== 'object') continue;
    for (const key of Object.keys(entry as Record<string, unknown>)) {
      if (!names.includes(key)) names.push(key);
    }
  }
  return names;
};

export const extractSecurityHeaders = (spec: unknown, schemeNames: string[]): string[] => {
  const specObj = spec as Record<string, unknown> | undefined;
  const components = specObj?.components as Record<string, unknown> | undefined;
  const schemes = (components?.securitySchemes || {}) as Record<string, Record<string, unknown>>;
  const headers: string[] = [];

  for (const schemeName of schemeNames) {
    const scheme = schemes?.[schemeName];
    if (!scheme) continue;
    if (scheme.type === 'apiKey' && scheme.in === 'header' && typeof scheme.name === 'string') {
      const headerName = scheme.name.trim();
      if (headerName && !headers.includes(headerName)) {
        headers.push(headerName);
      }
    }
  }

  return headers;
};

export const sanitizeToolName = (name: string): string => {
  const sanitized = name
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return sanitized || 'tool';
};

export const hasHeaderCaseInsensitive = (
  headers: Record<string, string>,
  headerName: string
): boolean => {
  const target = headerName.toLowerCase();
  return Object.keys(headers).some(
    (key) => key.toLowerCase() === target && !!headers[key]
  );
};

export const buildAuthHeaders = (
  headers?: Record<string, string>,
  token?: string
): Record<string, string> => {
  const merged: Record<string, string> = { ...(headers || {}) };
  const trimmedToken = String(token || '').trim();
  if (!trimmedToken) {
    return merged;
  }
  if (!hasHeaderCaseInsensitive(merged, 'authorization')) {
    merged.Authorization = `Bearer ${trimmedToken}`;
  }
  return merged;
};

export const resolveToolBaseUrl = (
  serverUrl: string | undefined,
  fallbackUrl: string
): string => {
  const trimmed = String(serverUrl || '').trim();
  if (!trimmed) return fallbackUrl;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) {
    const root = new URL(fallbackUrl);
    return `${root.protocol}//${root.host}${trimmed}`;
  }
  return ensureHttpUrl(trimmed);
};
