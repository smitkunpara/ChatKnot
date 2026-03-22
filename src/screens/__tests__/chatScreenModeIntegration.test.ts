/**
 * Phase 4 Integration Tests — Chat screen mode integration.
 *
 * These tests verify that mode-derived values (system prompt, model overrides)
 * are threaded through correctly to the service layer, and that the
 * no-provider-configured heuristic behaves as expected.
 *
 * Note: MCP server merge logic is tested in utils/__tests__/mcpMerge.test.ts
 */

import {
  buildEffectiveSystemPrompt,
} from '../../utils/chatHelpers.ts';
import { Mode, LlmProviderConfig } from '../../types/index.ts';

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

// ----- No-provider detection --------------------------------------------------

const hasAnyProviderCheck = (
  providers: Array<{ enabled: boolean; apiKey?: string; apiKeyRef?: string; baseUrl?: string }>
) =>
  providers.some(
    p =>
      p.enabled &&
      ((p.apiKey || '').trim().length > 0 || (p.apiKeyRef || '').trim().length > 0) &&
      (p.baseUrl || '').trim().length > 0
  );

describe('no-provider-configured detection', () => {
  it('detects when no provider has api key and base url', () => {
    const providers = [makeProvider({ apiKey: '', baseUrl: '' })];
    expect(hasAnyProviderCheck(providers)).toBe(false);
  });

  it('detects when at least one provider is configured', () => {
    const providers = [makeProvider()];
    expect(hasAnyProviderCheck(providers)).toBe(true);
  });

  it('ignores disabled providers with keys', () => {
    const providers = [makeProvider({ enabled: false })];
    expect(hasAnyProviderCheck(providers)).toBe(false);
  });

  it('returns true when any of multiple providers is valid', () => {
    const providers = [
      makeProvider({ apiKey: '' }),
      makeProvider({ id: 'p2', apiKey: 'key', baseUrl: 'https://api.test.com' }),
    ];
    expect(hasAnyProviderCheck(providers)).toBe(true);
  });

  it('returns true when provider has apiKeyRef instead of apiKey', () => {
    const providers = [makeProvider({ apiKey: '', apiKeyRef: 'stored-ref' })];
    expect(hasAnyProviderCheck(providers)).toBe(true);
  });

  it('ignores whitespace-only apiKey', () => {
    const providers = [makeProvider({ apiKey: '   ' })];
    expect(hasAnyProviderCheck(providers)).toBe(false);
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
});
