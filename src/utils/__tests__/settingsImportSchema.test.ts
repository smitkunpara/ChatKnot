import { describe, expect, it } from '@jest/globals';
import { validateAndNormalizeImportSettings } from '../settingsImportSchema.ts';

describe('validateAndNormalizeImportSettings', () => {
  it('accepts a valid payload and normalizes defaults', () => {
    const input = {
      providers: [
        {
          id: 'provider-1',
          name: 'OpenRouter',
          type: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'sk-or-key',
          model: 'deepseek/deepseek-chat',
          enabled: true,
        },
      ],
      mcpServers: [
        {
          id: 'mcp-1',
          name: 'Docs API',
          url: 'https://example.com/openapi.json',
          token: 'token-1',
          headers: { Authorization: 'Bearer token-1' },
          enabled: true,
          tools: [{ name: 'search', inputSchema: {} }],
          allowedTools: ['search'],
          autoApprovedTools: ['search'],
        },
      ],
      modes: [
        {
          id: 'mode-1',
          name: 'Default',
          systemPrompt: 'Assist the user',
          mcpServerOverrides: {
            'mcp-1': { enabled: true },
          },
          isDefault: true,
        },
      ],
      theme: 'system',
      lastUsedModel: { providerId: 'provider-1', model: 'deepseek/deepseek-chat' },
    };

    const out = validateAndNormalizeImportSettings(input);
    expect(out.settings.providers?.[0].id).toBe('provider-1');
    expect(out.settings.mcpServers?.[0].tools[0].name).toBe('search');
    expect(out.settings.modes?.[0].mcpServerOverrides['mcp-1'].enabled).toBe(true);
    expect(out.report.skippedPaths).toEqual([]);
    expect(out.report.ignoredPaths).toEqual([]);
  });

  it('skips invalid provider and reports exact path', () => {
    const input = {
      providers: [
        {
          id: 'provider-1',
          name: 'Broken',
          baseUrl: 'ftp://example.com',
          apiKey: 'k',
        },
      ],
    };

    const out = validateAndNormalizeImportSettings(input);
    expect(out.hasImportableData).toBe(true);
    expect(out.settings.providers).toEqual([]);
    expect(out.report.skippedPaths).toContain('settings.providers[0].baseUrl: invalid URL.');
  });

  it('ignores unknown keys and reports them', () => {
    const input = {
      providers: [],
      unsupportedFlag: true,
    };

    const out = validateAndNormalizeImportSettings(input);
    expect(out.report.ignoredPaths).toContain('settings.unsupportedFlag');
  });

  it('skips invalid override and reports exact path', () => {
    const input = {
      modes: [
        {
          id: 'm1',
          name: 'Mode',
          systemPrompt: 'hello',
          mcpServerOverrides: {
            s1: 'bad',
          },
        },
      ],
    };

    const out = validateAndNormalizeImportSettings(input);
    expect(out.settings.modes?.[0].mcpServerOverrides).toEqual({});
    expect(out.report.skippedPaths).toContain('settings.modes[0].mcpServerOverrides.s1: expected object, got string.');
  });

  it('throws when root is not an object', () => {
    expect(() => validateAndNormalizeImportSettings('bad')).toThrow('settings: expected object, got string.');
  });
});
