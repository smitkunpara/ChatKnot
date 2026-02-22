import {
  buildSecretRef,
  ensureMcpServerSecretRefs,
  ensureProviderSecretRef,
  isSecretRef,
  type LegacyMcpServerSecrets,
  type LegacyProviderSecrets,
} from '../migrations.ts';

describe('storage migrations foundation helpers', () => {
  it('builds stable secret refs and validates format', () => {
    const ref = buildSecretRef('provider', 'provider-1', 'apiKey');

    expect(ref).toBe('vault://provider/provider-1/apiKey');
    expect(isSecretRef(ref)).toBe(true);
    expect(isSecretRef('not-a-secret-ref')).toBe(false);
  });

  it('ensures provider secret refs without deleting legacy secrets', () => {
    const provider: LegacyProviderSecrets = {
      id: 'provider-1',
      apiKey: 'legacy-key',
    };

    const migrated = ensureProviderSecretRef(provider);

    expect(migrated.apiKey).toBe('legacy-key');
    expect(migrated.apiKeyRef).toBe('vault://provider/provider-1/apiKey');
  });

  it('ensures MCP server token/header refs while preserving legacy fields', () => {
    const server: LegacyMcpServerSecrets = {
      id: 'server-1',
      token: 'legacy-token',
      headers: {
        Authorization: 'Bearer 123',
      },
    };

    const migrated = ensureMcpServerSecretRefs(server);

    expect(migrated.token).toBe('legacy-token');
    expect(migrated.tokenRef).toBe('vault://mcp-server/server-1/token');
    expect(migrated.headerRefs).toEqual({
      Authorization: 'vault://mcp-server/server-1/header/Authorization',
    });
  });
});
