const SECRET_REF_PREFIX = 'vault://';

export interface LegacyProviderSecrets {
  id: string;
  apiKey?: string;
  apiKeyRef?: string;
}

export interface LegacyMcpServerSecrets {
  id: string;
  token?: string;
  tokenRef?: string;
  headers?: Record<string, string>;
  headerRefs?: Record<string, string>;
}

export const buildSecretRef = (scope: string, id: string, field: string): string => {
  return `${SECRET_REF_PREFIX}${scope}/${id}/${field}`;
};

export const isSecretRef = (value: unknown): value is string => {
  return typeof value === 'string' && value.startsWith(SECRET_REF_PREFIX);
};

export const ensureProviderSecretRef = <T extends LegacyProviderSecrets>(provider: T): T => {
  if (provider.apiKeyRef || !provider.apiKey) {
    return provider;
  }

  return {
    ...provider,
    apiKeyRef: buildSecretRef('provider', provider.id, 'apiKey'),
  };
};

export const ensureMcpServerSecretRefs = <T extends LegacyMcpServerSecrets>(server: T): T => {
  const nextTokenRef = server.tokenRef ?? (server.token ? buildSecretRef('mcp-server', server.id, 'token') : undefined);

  const nextHeaderRefs: Record<string, string> = {
    ...(server.headerRefs ?? {}),
  };

  for (const [name, value] of Object.entries(server.headers ?? {})) {
    if (!value || nextHeaderRefs[name]) {
      continue;
    }
    nextHeaderRefs[name] = buildSecretRef('mcp-server', server.id, `header/${name}`);
  }

  return {
    ...server,
    tokenRef: nextTokenRef,
    headerRefs: Object.keys(nextHeaderRefs).length > 0 ? nextHeaderRefs : server.headerRefs,
  };
};
