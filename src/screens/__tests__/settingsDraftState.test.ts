import {
  beginProviderDraft,
  beginServerDraft,
  clearAllDrafts,
  discardProviderDraft,
  discardServerDraft,
  saveProviderDraft,
  saveServerDraft,
  updateProviderDraft,
  updateServerDraft,
} from '../settingsDraftState.ts';
import { LlmProviderConfig, McpServerConfig } from '../../types';

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
  autoAllow: false,
  allowedTools: [],
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

  it('discards provider draft changes on cancel and clear-all', () => {
    const provider = createProvider();
    let drafts = beginProviderDraft({}, provider);
    drafts = updateProviderDraft(drafts, provider.id, { apiKey: 'draft-key' });

    drafts = discardProviderDraft(drafts, provider.id);
    expect(drafts[provider.id]).toBeUndefined();

    drafts = beginProviderDraft(drafts, provider);
    drafts = updateProviderDraft(drafts, provider.id, { apiKey: 'draft-key-2' });
    drafts = clearAllDrafts(drafts);

    expect(drafts).toEqual({});
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
    const commit = jest.fn();

    let drafts = beginServerDraft({}, server);
    drafts = updateServerDraft(drafts, server.id, {
      name: 'Edited Name',
      headers: [
        { id: 'header-1', key: 'X-Token', value: 'token-123' },
        { id: 'header-2', key: '', value: 'should-be-dropped' },
        { id: 'header-3', key: 'X-Trace', value: 'trace-abc' },
      ],
    });

    const nextDrafts = saveServerDraft(drafts, server, commit);

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({
      ...server,
      name: 'Edited Name',
      headers: { 'X-Token': 'token-123', 'X-Trace': 'trace-abc' },
    });
    expect(nextDrafts[server.id]).toBeUndefined();
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
});
