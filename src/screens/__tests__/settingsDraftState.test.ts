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
      headerKey: 'X-Api-Key',
      headerValue: 'draft-header',
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
      headerKey: 'X-Token',
      headerValue: 'token-123',
    });

    const nextDrafts = saveServerDraft(drafts, server, commit);

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({
      ...server,
      name: 'Edited Name',
      headers: { 'X-Token': 'token-123' },
    });
    expect(nextDrafts[server.id]).toBeUndefined();
  });
});
