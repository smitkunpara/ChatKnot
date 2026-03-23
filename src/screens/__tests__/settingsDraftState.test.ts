import {
  beginProviderDraft,
  beginServerDraft,
  discardProviderDraft,
  discardServerDraft,
  saveProviderDraft,
  updateProviderDraft,
  updateServerDraft,
  beginModeDraft,
  updateModeDraft,
  discardModeDraft,
  saveModeDraft,
  saveServerDraftWithValidation,
} from '../settingsDraftState';
import { LlmProviderConfig, McpServerConfig, Mode } from '../../types';

const createProvider = (): LlmProviderConfig => ({
  id: 'provider-1',
  name: 'Provider One',
  type: 'custom-openai',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'persisted-key',
  model: 'gpt-4o-mini',
  availableModels: ['gpt-4o-mini'],
  hiddenModels: [],
  enabled: true,
});

const createServer = (): McpServerConfig => ({
  id: 'server-1',
  name: 'Server One',
  url: 'https://mcp.example.com',
  headers: { Authorization: 'Bearer persisted-token' },
  enabled: true,
  tools: [],
  allowedTools: [],
  autoApprovedTools: [],
});

describe('settingsDraftState', () => {
  it('does not mutate provider persistence source while editing draft', () => {
    const provider = createProvider();
    let drafts = beginProviderDraft({}, provider);

    drafts = updateProviderDraft(drafts, provider.id, {
      baseUrl: 'https://draft.example.com/v1',
    });

    expect(provider.baseUrl).toBe('https://api.example.com/v1');
    expect(drafts[provider.id]?.baseUrl).toBe('https://draft.example.com/v1');
  });

  it('discards provider draft changes on cancel', () => {
    const provider = createProvider();
    let drafts = beginProviderDraft({}, provider);
    drafts = updateProviderDraft(drafts, provider.id, { apiKey: 'draft-key' });

    drafts = discardProviderDraft(drafts, provider.id);
    expect(drafts[provider.id]).toBeUndefined();
  });

  it('saves provider draft with exactly one committed update', () => {
    const provider = createProvider();
    const commit = jest.fn();

    let drafts = beginProviderDraft({}, provider);
    drafts = updateProviderDraft(drafts, provider.id, {
      baseUrl: 'https://draft.example.com/v1',
      apiKey: 'draft-key',
    });

    const nextDrafts = saveProviderDraft(drafts, provider, commit);

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({
      ...provider,
      baseUrl: 'https://draft.example.com/v1',
      apiKey: 'draft-key',
    });
    expect(nextDrafts[provider.id]).toBeUndefined();
  });

  it('allows clearing hiddenModels via updateProviderDraft with empty array', () => {
    const provider = createProvider();
    provider.hiddenModels = ['gpt-4.1-mini'];
    let drafts = beginProviderDraft({}, provider);

    expect(drafts[provider.id]?.hiddenModels).toEqual(['gpt-4.1-mini']);

    drafts = updateProviderDraft(drafts, provider.id, { hiddenModels: [] });
    expect(drafts[provider.id]?.hiddenModels).toEqual([]);
  });

  it('does not mutate server persistence source while editing draft and discards on cancel', () => {
    const server = createServer();
    let drafts = beginServerDraft({}, server);

    drafts = updateServerDraft(drafts, server.id, {
      url: 'https://draft-mcp.example.com',
      headers: [
        { id: 'header-1', key: 'X-Api-Key', value: 'draft-header' },
        { id: 'header-2', key: 'X-Trace', value: 'trace-123' },
      ],
    });

    expect(server.url).toBe('https://mcp.example.com');
    expect(server.headers).toEqual({ Authorization: 'Bearer persisted-token' });

    drafts = discardServerDraft(drafts, server.id);
    expect(drafts[server.id]).toBeUndefined();
  });

  it('saves server draft with one update and normalized headers', () => {
    const server = createServer();
    let drafts = beginServerDraft({}, server);
    
    const nextDrafts = updateServerDraft(drafts, server.id, {
      name: 'Edited Name',
      headers: [
        { id: 'header-1', key: 'X-Token', value: 'token-123' },
        { id: 'header-3', key: 'X-Trace', value: 'trace-abc' },
      ],
    });

    expect(nextDrafts[server.id]?.name).toBe('Edited Name');
  });

  it('begins server draft with all existing headers, not just the first header', () => {
    const server = createServer();
    server.headers = {
      Authorization: 'Bearer persisted-token',
      'X-Api-Key': 'abc123',
    };

    const drafts = beginServerDraft({}, server);

    expect(drafts[server.id]?.headers).toEqual([
      { id: 'Authorization', key: 'Authorization', value: 'Bearer persisted-token' },
      { id: 'X-Api-Key', key: 'X-Api-Key', value: 'abc123' },
    ]);
  });

  it('persists auto-approve and allowed-tools policy when saving server draft', () => {
    const server = createServer();
    let drafts = beginServerDraft({}, server);

    const nextDrafts = updateServerDraft(drafts, server.id, {
      allowedTools: ['alpha.search', 'beta.lookup'],
      autoApprovedTools: ['beta.lookup'],
    });

    expect(nextDrafts[server.id]?.allowedTools).toEqual(['alpha.search', 'beta.lookup']);
    expect(nextDrafts[server.id]?.autoApprovedTools).toEqual(['beta.lookup']);
  });

  it('saveServerDraftWithValidation commits and clears draft on successful validation', async () => {
    const server = createServer();
    const commit = jest.fn();
    const validateEndpoint = jest.fn().mockResolvedValue({
      ok: true,
      normalizedInputUrl: 'https://mcp.example.com/v1',
      resolvedBaseUrl: 'https://mcp.example.com/v1',
      spec: {},
      tools: [],
    });

    const drafts = beginServerDraft({}, server);
    const result = await saveServerDraftWithValidation({
      drafts,
      server,
      commit,
      validateEndpoint,
    });

    expect(validateEndpoint).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({
      id: server.id,
      url: 'https://mcp.example.com/v1',
    }));
    expect(result.error).toBeNull();
    expect(result.errorMessage).toBeNull();
    expect(result.drafts[server.id]).toBeUndefined();
  });

  it('saveServerDraftWithValidation keeps draft and returns formatted error when validation fails', async () => {
    const server = createServer();
    const commit = jest.fn();
    const validateEndpoint = jest.fn().mockResolvedValue({
      ok: false,
      error: {
        code: 'INVALID_SPEC',
        field: 'spec',
        message: 'Invalid spec',
      },
    });

    const drafts = beginServerDraft({}, server);
    const result = await saveServerDraftWithValidation({
      drafts,
      server,
      commit,
      validateEndpoint,
    });

    expect(validateEndpoint).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    expect(result.error).toEqual({
      code: 'INVALID_SPEC',
      field: 'spec',
      message: 'Invalid spec',
    });
    expect(typeof result.errorMessage).toBe('string');
    expect(result.errorMessage).toContain('Invalid spec');
    expect(result.drafts[server.id]).toBeDefined();
  });

  it('saveServerDraftWithValidation skips validation for disabled servers and commits directly', async () => {
    const server = createServer();
    const commit = jest.fn();
    const validateEndpoint = jest.fn();

    let drafts = beginServerDraft({}, server);
    drafts = updateServerDraft(drafts, server.id, { enabled: false });

    const result = await saveServerDraftWithValidation({
      drafts,
      server,
      commit,
      validateEndpoint,
    });

    expect(validateEndpoint).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({
      id: server.id,
      enabled: false,
    }));
    expect(result.error).toBeNull();
    expect(result.errorMessage).toBeNull();
    expect(result.drafts[server.id]).toBeUndefined();
  });
});

const createMode = (overrides: Partial<Mode> = {}): Mode => ({
  id: 'mode-1',
  name: 'Default',
  systemPrompt: 'You are helpful.',
  mcpServerOverrides: {},
  isDefault: true,
  ...overrides,
});

describe('settingsDraftState — ModeDraft', () => {
  it('begins mode draft without mutating original', () => {
    const mode = createMode();
    const drafts = beginModeDraft({}, mode);

    expect(drafts[mode.id]).toEqual({
      name: 'Default',
      systemPrompt: 'You are helpful.',
      mcpServerOverrides: {},
    });
    expect(mode.name).toBe('Default');
  });

  it('updates mode draft fields', () => {
    const mode = createMode();
    let drafts = beginModeDraft({}, mode);
    drafts = updateModeDraft(drafts, mode.id, { name: 'Renamed' });

    expect(drafts[mode.id]?.name).toBe('Renamed');
    expect(drafts[mode.id]?.systemPrompt).toBe('You are helpful.');
  });

  it('returns same drafts when updating non-existent mode', () => {
    const drafts = updateModeDraft({}, 'nonexistent', { name: 'X' });
    expect(drafts).toEqual({});
  });

  it('discards mode draft', () => {
    const mode = createMode();
    let drafts = beginModeDraft({}, mode);
    drafts = discardModeDraft(drafts, mode.id);
    expect(drafts[mode.id]).toBeUndefined();
  });

  it('saves mode draft with commit and discards', () => {
    const mode = createMode();
    const commit = jest.fn();

    let drafts = beginModeDraft({}, mode);
    drafts = updateModeDraft(drafts, mode.id, {
      name: 'Coding',
      systemPrompt: 'Write code.',
    });

    const nextDrafts = saveModeDraft(drafts, mode, commit);

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(mode.id, {
      name: 'Coding',
      systemPrompt: 'Write code.',
      mcpServerOverrides: {},
    });
    expect(nextDrafts[mode.id]).toBeUndefined();
  });

  it('returns drafts unchanged when saving non-existent mode draft', () => {
    const mode = createMode();
    const commit = jest.fn();
    const result = saveModeDraft({}, mode, commit);
    expect(commit).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });
});
