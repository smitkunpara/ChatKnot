import { describe, expect, it } from '@jest/globals';
import { buildSettingsExportPayload, parseSettingsImport, serializeSettingsExport, SETTINGS_EXPORT_SCHEMA } from '../settingsTransfer';
import { AppSettings } from '../../../types';

const makeSnapshot = (): Pick<AppSettings, 'providers' | 'mcpServers' | 'modes' | 'theme' | 'lastUsedModel'> => ({
  providers: [
    {
      id: 'provider-1',
      name: 'Primary',
      type: 'custom-openai',
      baseUrl: 'https://example.com/v1',
      apiKey: 'sk-secret',
      apiKeyRef: 'secret://provider-1',
      model: 'gpt-4.1-mini',
      availableModels: ['gpt-4.1-mini', 'gpt-4.1-nano'],
      hiddenModels: ['gpt-4.1-nano'],
      enabled: true,
    },
  ],
  mcpServers: [
    {
      id: 'mcp-1',
      name: 'Docs',
      url: 'https://mcp.example.com',
      token: 'secret-token',
      tokenRef: 'secret://mcp-1',
      headers: { Authorization: 'Bearer secret' },
      headerRefs: { Authorization: 'secret://header' },
      enabled: true,
      tools: [
        { name: 'search_docs', inputSchema: {} },
        { name: 'delete_docs', inputSchema: {} },
      ],
      allowedTools: ['search_docs'],
      autoApprovedTools: ['search_docs', 'delete_docs'],
    },
  ],
  modes: [
    {
      id: 'mode-1',
      name: 'Default',
      systemPrompt: 'You are helpful',
      isDefault: true,
      mcpServerOverrides: {
        'mcp-1': { enabled: true },
      },
    },
  ],
  theme: 'system',
  lastUsedModel: { providerId: 'provider-1', model: 'gpt-4.1-mini' },
});

describe('settingsTransfer', () => {
  it('builds export payload including secrets for plain JSON backup', () => {
    const payload = buildSettingsExportPayload(makeSnapshot());

    expect(payload.schema).toBe(SETTINGS_EXPORT_SCHEMA);
    expect(payload.settings.providers[0].availableModels).toEqual(['gpt-4.1-mini']);
    expect(payload.settings.providers[0].apiKey).toBe('sk-secret');
    expect(payload.settings.mcpServers[0].token).toBe('secret-token');
    expect(payload.settings.mcpServers[0].headers).toEqual({ Authorization: 'Bearer secret' });
    expect(payload.settings.mcpServers[0].allowedTools).toEqual(['search_docs']);
    expect(payload.settings.mcpServers[0].autoApprovedTools).toEqual(['search_docs']);
  });

  it('round-trips JSON export/import', () => {
    const payload = buildSettingsExportPayload(makeSnapshot());
    const json = serializeSettingsExport(payload);
    const parsed = parseSettingsImport(json, 'settings.json');

    expect(parsed.schema).toBe(SETTINGS_EXPORT_SCHEMA);
    expect(parsed.settings).toEqual(payload.settings);
  });

  it('rejects non-JSON import files', () => {
    expect(() => parseSettingsImport('{"settings":{}}', 'settings.csv')).toThrow('Only JSON settings files are supported.');
  });

  it('throws for empty import file', () => {
    expect(() => parseSettingsImport('   ', 'settings.json')).toThrow('Imported file is empty.');
  });
});
