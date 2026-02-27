export type OpenApiToolMeta = {
  path: string;
  method: string;
  baseUrl?: string;
  securityHeaders?: string[];
};

export const ensureHttpUrl = (rawUrl: string): string => {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

export const extractSecuritySchemeNames = (security: any): string[] => {
  if (!Array.isArray(security)) return [];
  const names: string[] = [];
  for (const entry of security) {
    if (!entry || typeof entry !== 'object') continue;
    for (const key of Object.keys(entry)) {
      if (!names.includes(key)) names.push(key);
    }
  }
  return names;
};

export const extractSecurityHeaders = (spec: any, schemeNames: string[]): string[] => {
  const schemes = spec?.components?.securitySchemes || {};
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
