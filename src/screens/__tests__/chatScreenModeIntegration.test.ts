/**
 * Phase 4 Integration Tests — Chat screen mode integration.
 *
 * These tests verify that mode-derived values (system prompt, model overrides,
 * MCP servers) are threaded through correctly to the service layer, and that
 * the no-provider-configured heuristic behaves as expected.
 */

import {
  buildEffectiveSystemPrompt,
} from '../../utils/chatHelpers.ts';
import { mergeServersWithOverrides } from '../../utils/mcpMerge.ts';
import { Mode, LlmProviderConfig, McpServerConfig } from '../../types/index.ts';

// ----- Helpers ----------------------------------------------------------------

const makeMode = (overrides: Partial<Mode> = {}): Mode => ({
  id: 'mode-1',
  name: 'Default',
  systemPrompt: '',
  mcpServerOverrides: {},
  isDefault: true,
  ...overrides,
});

const makeProvider = (overrides: Partial<LlmProviderConfig> = {}): LlmProviderConfig => ({
  id: 'provider-1',
  name: 'Primary',
  type: 'custom-openai',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'secret',
  model: 'gpt-4o-mini',
  availableModels: ['gpt-4o-mini', 'gpt-4.1-mini'],
  hiddenModels: [],
  enabled: true,
  ...overrides,
});

// ----- Active mode derivation -------------------------------------------------

describe('active mode derivation', () => {
  it('selects mode matching lastUsedModeId', () => {
    const modes: Mode[] = [
      makeMode({ id: 'a', name: 'Alpha' }),
      makeMode({ id: 'b', name: 'Beta' }),
    ];
    const lastUsedModeId = 'b';
    const active = modes.find(m => m.id === lastUsedModeId) ?? modes[0] ?? null;
    expect(active?.name).toBe('Beta');
  });

  it('falls back to first mode when lastUsedModeId is null', () => {
    const modes: Mode[] = [
      makeMode({ id: 'a', name: 'Alpha' }),
      makeMode({ id: 'b', name: 'Beta' }),
    ];
    const lastUsedModeId: string | null = null;
    const active = modes.find(m => m.id === lastUsedModeId!) ?? modes[0] ?? null;
    expect(active?.name).toBe('Alpha');
  });

  it('falls back to first mode when lastUsedModeId does not match any mode', () => {
    const modes: Mode[] = [makeMode({ id: 'a', name: 'Alpha' })];
    const lastUsedModeId = 'nonexistent';
    const active = modes.find(m => m.id === lastUsedModeId) ?? modes[0] ?? null;
    expect(active?.name).toBe('Alpha');
  });

  it('returns null when modes array is empty', () => {
    const modes: Mode[] = [];
    const active = modes.find(m => m.id === 'any') ?? modes[0] ?? null;
    expect(active).toBeNull();
  });
});

// ----- Mode system prompt threading -------------------------------------------

describe('mode system prompt threading', () => {
  it('uses mode system prompt when conversation has no custom prompt', () => {
    const result = buildEffectiveSystemPrompt({
      conversationPrompt: '',
      modePrompt: 'You are a code assistant.',
    });
    expect(result).toBe('You are a code assistant.');
  });

  it('conversation prompt takes priority over mode prompt', () => {
    const result = buildEffectiveSystemPrompt({
      conversationPrompt: 'Custom conversation instruction',
      modePrompt: 'Mode instruction',
    });
    expect(result).toBe('Custom conversation instruction');
  });

  it('falls back to default when both are empty', () => {
    const result = buildEffectiveSystemPrompt({
      conversationPrompt: '',
      modePrompt: '',
    });
    expect(result).toBe('You are a helpful AI assistant.');
  });
});

// ----- Mode MCP servers derivation (global + overrides) -----------------------

const makeServer = (overrides: Partial<McpServerConfig> = {}): McpServerConfig => ({
  id: 's1',
  name: 'Server',
  url: 'https://mcp.example.com',
  enabled: true,
  tools: [{ name: 'tool1', description: 'T1', inputSchema: {} }],
  headers: {},
  allowedTools: [],
  autoApprovedTools: [],
  ...overrides,
});

describe('mode MCP server derivation via mergeServersWithOverrides', () => {
  it('merges global servers with mode overrides for tool count', () => {
    const globalServers = [makeServer({ id: 's1', enabled: true })];
    const mode = makeMode({
      mcpServerOverrides: { s1: { enabled: true } },
    });
    const servers = mergeServersWithOverrides(globalServers, mode.mcpServerOverrides);
    const count = servers.reduce((acc, s) => {
      if (!s.enabled) return acc;
      const allowed = Array.isArray(s.allowedTools) ? s.allowedTools : [];
      const known = Array.isArray(s.tools) ? s.tools : [];
      return acc + (allowed.length > 0 ? allowed.length : known.length);
    }, 0);
    expect(count).toBe(1);
  });

  it('mode override can disable a globally enabled server', () => {
    const globalServers = [makeServer({ id: 's1', enabled: true })];
    const mode = makeMode({
      mcpServerOverrides: { s1: { enabled: false } },
    });
    const servers = mergeServersWithOverrides(globalServers, mode.mcpServerOverrides);
    const count = servers.reduce((acc, s) => {
      if (!s.enabled) return acc;
      return acc + (s.tools?.length ?? 0);
    }, 0);
    expect(count).toBe(0);
  });

  it('returns empty array when no global servers exist', () => {
    const mode = makeMode({ mcpServerOverrides: {} });
    const servers = mergeServersWithOverrides([], mode.mcpServerOverrides);
    expect(servers).toEqual([]);
  });

  it('uses global server defaults when no mode override exists', () => {
    const globalServers = [makeServer({ id: 's1', enabled: true })];
    const mode = makeMode({ mcpServerOverrides: {} });
    const servers = mergeServersWithOverrides(globalServers, mode.mcpServerOverrides);
    expect(servers[0].enabled).toBe(true);
  });

  it('mode override can restrict allowedTools', () => {
    const globalServers = [makeServer({
      id: 's1',
      tools: [
        { name: 'tool1', description: 'T1', inputSchema: {} },
        { name: 'tool2', description: 'T2', inputSchema: {} },
      ],
      allowedTools: [],
    })];
    const mode = makeMode({
      mcpServerOverrides: { s1: { enabled: true, allowedTools: ['tool1'] } },
    });
    const servers = mergeServersWithOverrides(globalServers, mode.mcpServerOverrides);
    expect(servers[0].allowedTools).toEqual(['tool1']);
  });

  it('mode override can set autoApprovedTools', () => {
    const globalServers = [makeServer({
      id: 's1',
      autoApprovedTools: [],
    })];
    const mode = makeMode({
      mcpServerOverrides: { s1: { enabled: true, autoApprovedTools: ['tool1'] } },
    });
    const servers = mergeServersWithOverrides(globalServers, mode.mcpServerOverrides);
    expect(servers[0].autoApprovedTools).toEqual(['tool1']);
  });

  it('falls back to global allowedTools when mode override omits them', () => {
    const globalServers = [makeServer({
      id: 's1',
      allowedTools: ['tool1', 'tool2'],
      autoApprovedTools: ['tool1'],
    })];
    const mode = makeMode({
      mcpServerOverrides: { s1: { enabled: true } },
    });
    const servers = mergeServersWithOverrides(globalServers, mode.mcpServerOverrides);
    expect(servers[0].allowedTools).toEqual(['tool1', 'tool2']);
    expect(servers[0].autoApprovedTools).toEqual(['tool1']);
  });

  it('mode override with empty allowedTools overrides global non-empty', () => {
    const globalServers = [makeServer({
      id: 's1',
      allowedTools: ['tool1', 'tool2'],
    })];
    const mode = makeMode({
      mcpServerOverrides: { s1: { enabled: true, allowedTools: [] } },
    });
    const servers = mergeServersWithOverrides(globalServers, mode.mcpServerOverrides);
    expect(servers[0].allowedTools).toEqual([]);
  });
});

// ----- No-provider detection --------------------------------------------------

describe('no-provider-configured detection', () => {
  it('detects when no provider has api key and base url', () => {
    const providers = [makeProvider({ apiKey: '', baseUrl: '' })];
    const hasAny = providers.some(
      p => p.enabled && (p.apiKey || '').trim().length > 0 && (p.baseUrl || '').trim().length > 0
    );
    expect(hasAny).toBe(false);
  });

  it('detects when at least one provider is configured', () => {
    const providers = [makeProvider()];
    const hasAny = providers.some(
      p => p.enabled && (p.apiKey || '').trim().length > 0 && (p.baseUrl || '').trim().length > 0
    );
    expect(hasAny).toBe(true);
  });

  it('ignores disabled providers with keys', () => {
    const providers = [makeProvider({ enabled: false })];
    const hasAny = providers.some(
      p => p.enabled && (p.apiKey || '').trim().length > 0 && (p.baseUrl || '').trim().length > 0
    );
    expect(hasAny).toBe(false);
  });

  it('returns true when any of multiple providers is valid', () => {
    const providers = [
      makeProvider({ apiKey: '' }),
      makeProvider({ id: 'p2', apiKey: 'key', baseUrl: 'https://api.test.com' }),
    ];
    const hasAny = providers.some(
      p => p.enabled && (p.apiKey || '').trim().length > 0 && (p.baseUrl || '').trim().length > 0
    );
    expect(hasAny).toBe(true);
  });
});

// ----- Mode switching ---------------------------------------------------------

describe('mode switching behavior', () => {
  it('switching mode updates active mode reference', () => {
    const modes: Mode[] = [
      makeMode({ id: 'a', name: 'Alpha', systemPrompt: 'Alpha prompt' }),
      makeMode({ id: 'b', name: 'Beta', systemPrompt: 'Beta prompt' }),
    ];

    let lastUsedModeId = 'a';
    const setLastUsedMode = (id: string) => { lastUsedModeId = id; };

    setLastUsedMode('b');
    const active = modes.find(m => m.id === lastUsedModeId) ?? modes[0] ?? null;
    expect(active?.name).toBe('Beta');
    expect(active?.systemPrompt).toBe('Beta prompt');
  });

  it('switching mode changes derived MCP servers via merge', () => {
    const globalServers = [makeServer({
      id: 's1', name: 'S', url: 'https://mcp.test.com',
      enabled: true, tools: [],
    })];
    const modes: Mode[] = [
      makeMode({ id: 'a', mcpServerOverrides: { s1: { enabled: false } } }),
      makeMode({ id: 'b', mcpServerOverrides: { s1: { enabled: true } } }),
    ];

    const serversA = mergeServersWithOverrides(globalServers, modes[0].mcpServerOverrides);
    expect(serversA[0].enabled).toBe(false);

    const serversB = mergeServersWithOverrides(globalServers, modes[1].mcpServerOverrides);
    expect(serversB[0].enabled).toBe(true);
  });

  it('switching mode changes derived tool-level overrides', () => {
    const globalServers = [makeServer({
      id: 's1', enabled: true,
      tools: [
        { name: 'tool1', description: 'T1', inputSchema: {} },
        { name: 'tool2', description: 'T2', inputSchema: {} },
      ],
      allowedTools: [],
      autoApprovedTools: [],
    })];
    const modes: Mode[] = [
      makeMode({ id: 'a', mcpServerOverrides: { s1: { enabled: true, allowedTools: ['tool1'] } } }),
      makeMode({ id: 'b', mcpServerOverrides: { s1: { enabled: true, allowedTools: ['tool1', 'tool2'], autoApprovedTools: ['tool2'] } } }),
    ];

    const serversA = mergeServersWithOverrides(globalServers, modes[0].mcpServerOverrides);
    expect(serversA[0].allowedTools).toEqual(['tool1']);
    expect(serversA[0].autoApprovedTools).toEqual([]);

    const serversB = mergeServersWithOverrides(globalServers, modes[1].mcpServerOverrides);
    expect(serversB[0].allowedTools).toEqual(['tool1', 'tool2']);
    expect(serversB[0].autoApprovedTools).toEqual(['tool2']);
  });
});
