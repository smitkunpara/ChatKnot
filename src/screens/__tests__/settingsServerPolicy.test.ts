import { hasServerDraftChanges } from '../settingsServerPolicy';
import { McpServerConfig } from '../../types';
import { McpServerDraft } from '../settingsDraftState';

const createServer = (): McpServerConfig => ({
  id: 'server-1',
  name: 'Server One',
  url: 'https://mcp.example.com',
  headers: { Authorization: 'Bearer token', 'X-Trace': 'trace-1' },
  enabled: true,
  tools: [],
  allowedTools: [],
  autoApprovedTools: ['tool.alpha'],
});

const createDraft = (): McpServerDraft => ({
  name: 'Server One',
  url: 'https://mcp.example.com',
  enabled: true,
  allowedTools: [],
  autoApprovedTools: ['tool.alpha'],
  headers: [
    { id: 'a', key: 'X-Trace', value: 'trace-1' },
    { id: 'b', key: 'Authorization', value: 'Bearer token' },
  ],
  token: undefined,
});

describe('settingsServerPolicy', () => {
  it('treats reordered headers as unchanged in draft comparison', () => {
    const changed = hasServerDraftChanges(createDraft(), createServer());
    expect(changed).toBe(false);
  });

  it('marks draft changed when token or url differs', () => {
    const draft = createDraft();
    draft.url = 'https://mcp.example.com/v2';

    expect(hasServerDraftChanges(draft, createServer())).toBe(true);
  });

  it('marks draft changed when allowedTools differs', () => {
    const draft: McpServerDraft = {
      ...createDraft(),
      allowedTools: ['tool.alpha', 'tool.beta'],
    };

    expect(hasServerDraftChanges(draft, createServer())).toBe(true);
  });

  it('marks draft changed when autoApprovedTools differs', () => {
    const draft: McpServerDraft = {
      ...createDraft(),
      autoApprovedTools: ['tool.alpha', 'tool.beta'],
    };

    expect(hasServerDraftChanges(draft, createServer())).toBe(true);
  });

  it('treats identical allowedTools as unchanged', () => {
    const draft: McpServerDraft = {
      ...createDraft(),
      allowedTools: [],
    };

    expect(hasServerDraftChanges(draft, createServer())).toBe(false);
  });

  it('treats identical autoApprovedTools as unchanged', () => {
    const draft: McpServerDraft = {
      ...createDraft(),
      autoApprovedTools: ['tool.alpha'],
    };

    expect(hasServerDraftChanges(draft, createServer())).toBe(false);
  });

  it('marks draft changed when name differs', () => {
    const draft: McpServerDraft = {
      ...createDraft(),
      name: 'Different Name',
    };

    expect(hasServerDraftChanges(draft, createServer())).toBe(true);
  });

  it('marks draft changed when enabled differs', () => {
    const draft: McpServerDraft = {
      ...createDraft(),
      enabled: false,
    };

    expect(hasServerDraftChanges(draft, createServer())).toBe(true);
  });

  it('treats identical draft and server as unchanged', () => {
    expect(hasServerDraftChanges(createDraft(), createServer())).toBe(false);
  });
});
