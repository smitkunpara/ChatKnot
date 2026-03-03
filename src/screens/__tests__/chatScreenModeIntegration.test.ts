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
import { resolveModelSelection } from '../../services/llm/modelSelection.ts';
import { Mode, LlmProviderConfig } from '../../types/index.ts';

// ----- Helpers ----------------------------------------------------------------

const makeMode = (overrides: Partial<Mode> = {}): Mode => ({
  id: 'mode-1',
  name: 'Default',
  systemPrompt: '',
  providerId: null,
  model: null,
  mcpServers: [],
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

// ----- Mode model resolution --------------------------------------------------

describe('mode model resolution in chat context', () => {
  const providers = [
    makeProvider(),
    makeProvider({ id: 'provider-2', name: 'Alt', availableModels: ['claude-4'] }),
  ];

  it('resolves to mode provider/model when no explicit selection', () => {
    const result = resolveModelSelection({
      providers,
      modeProviderId: 'provider-2',
      modeModel: 'claude-4',
    });
    expect(result.selection?.providerId).toBe('provider-2');
    expect(result.selection?.model).toBe('claude-4');
  });

  it('explicit conversation selection overrides mode', () => {
    const result = resolveModelSelection({
      providers,
      selectedProviderId: 'provider-1',
      selectedModel: 'gpt-4o-mini',
      modeProviderId: 'provider-2',
      modeModel: 'claude-4',
    });
    expect(result.selection?.providerId).toBe('provider-1');
    expect(result.selection?.model).toBe('gpt-4o-mini');
  });

  it('null mode provider/model falls through to lastUsedModel', () => {
    const result = resolveModelSelection({
      providers,
      modeProviderId: null,
      modeModel: null,
      lastUsedModel: { providerId: 'provider-1', model: 'gpt-4.1-mini' },
    });
    expect(result.selection?.model).toBe('gpt-4.1-mini');
  });
});

// ----- Mode MCP servers derivation --------------------------------------------

describe('mode MCP server derivation', () => {
  it('active mode servers are used for MCP tool count', () => {
    const mode = makeMode({
      mcpServers: [
        {
          id: 's1',
          name: 'Server',
          url: 'https://mcp.example.com',
          enabled: true,
          tools: [{ name: 'tool1', description: 'T1', inputSchema: {} }],
          autoAllow: false,
          headers: {},
          allowedTools: [],
          autoApprovedTools: [],
        },
      ],
    });
    const servers = mode.mcpServers;
    const count = servers.reduce((acc, s) => {
      if (!s.enabled) return acc;
      const allowed = Array.isArray(s.allowedTools) ? s.allowedTools : [];
      const known = Array.isArray(s.tools) ? s.tools : [];
      return acc + (allowed.length > 0 ? allowed.length : known.length);
    }, 0);
    expect(count).toBe(1);
  });

  it('disabled servers are excluded from tool count', () => {
    const mode = makeMode({
      mcpServers: [
        {
          id: 's1',
          name: 'Disabled',
          url: 'https://mcp.example.com',
          enabled: false,
          tools: [{ name: 'tool1', description: 'T1', inputSchema: {} }],
          autoAllow: false,
          headers: {},
          allowedTools: [],
          autoApprovedTools: [],
        },
      ],
    });
    const servers = mode.mcpServers;
    const count = servers.reduce((acc, s) => {
      if (!s.enabled) return acc;
      return acc + (s.tools?.length ?? 0);
    }, 0);
    expect(count).toBe(0);
  });

  it('returns empty servers array when mode has no MCP servers', () => {
    const mode = makeMode({ mcpServers: [] });
    expect(mode.mcpServers).toEqual([]);
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

  it('switching mode changes derived MCP servers', () => {
    const modes: Mode[] = [
      makeMode({ id: 'a', mcpServers: [] }),
      makeMode({
        id: 'b',
        mcpServers: [{
          id: 's1', name: 'S', url: 'https://mcp.test.com',
          enabled: true, tools: [], autoAllow: false, headers: {},
          allowedTools: [], autoApprovedTools: [],
        }],
      }),
    ];

    const activeModeA = modes.find(m => m.id === 'a')!;
    expect(activeModeA.mcpServers.length).toBe(0);

    const activeModeB = modes.find(m => m.id === 'b')!;
    expect(activeModeB.mcpServers.length).toBe(1);
  });

  it('switching mode changes model resolution override', () => {
    const providers = [
      makeProvider(),
      makeProvider({ id: 'p2', name: 'Alt', availableModels: ['claude-4'] }),
    ];
    const modes: Mode[] = [
      makeMode({ id: 'a', providerId: 'provider-1', model: 'gpt-4o-mini' }),
      makeMode({ id: 'b', providerId: 'p2', model: 'claude-4' }),
    ];

    const resA = resolveModelSelection({
      providers,
      modeProviderId: modes[0].providerId,
      modeModel: modes[0].model,
    });
    expect(resA.selection?.model).toBe('gpt-4o-mini');

    const resB = resolveModelSelection({
      providers,
      modeProviderId: modes[1].providerId,
      modeModel: modes[1].model,
    });
    expect(resB.selection?.model).toBe('claude-4');
  });
});
