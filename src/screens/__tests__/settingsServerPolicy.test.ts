import {
  hasServerDraftChanges,
  toggleAllowedToolInDraft,
  toggleAutoApprovedToolInDraft,
} from '../settingsServerPolicy';
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

  it('toggleAllowedToolInDraft disables one tool from all-enabled sentinel and filters auto-approved', () => {
    const draft = createDraft();
    const result = toggleAllowedToolInDraft(draft, 'tool.beta', ['tool.alpha', 'tool.beta']);

    expect(result.allowedTools).toEqual(['tool.alpha']);
    expect(result.autoApprovedTools).toEqual(['tool.alpha']);
  });

  it('toggleAutoApprovedToolInDraft enables tool first when it is currently disabled', () => {
    const draft: McpServerDraft = {
      ...createDraft(),
      allowedTools: ['tool.alpha'],
      autoApprovedTools: [],
    };

    const result = toggleAutoApprovedToolInDraft(draft, 'tool.beta', ['tool.alpha', 'tool.beta']);

    expect(result.allowedTools).toEqual([]);
    expect(result.autoApprovedTools).toEqual(['tool.beta']);
  });
});
