import {
  beginServerDraft,
  saveServerDraftWithValidation,
} from '../settingsDraftState.ts';
import {
  McpServerConfig,
  OpenApiValidationFailure,
  OpenApiValidationResult,
} from '../../types';

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

describe('settings MCP validation flow', () => {
  it('blocks save and returns a surfaced validation message for invalid endpoint', async () => {
    const server = createServer();
    const commit = jest.fn();
    const drafts = beginServerDraft({}, server);

    const failedValidation: OpenApiValidationFailure = {
      ok: false,
      error: {
        code: 'HTTP_STATUS',
        field: 'url',
        message: 'Endpoint returned HTTP 404',
        details: {
          status: 404,
          attemptedUrls: ['https://mcp.example.com/openapi.json'],
        },
      },
    };

    const result = await saveServerDraftWithValidation({
      drafts,
      server,
      commit,
      validateEndpoint: jest.fn(async () => failedValidation),
    });

    expect(commit).not.toHaveBeenCalled();
    expect(result.drafts).toEqual(drafts);
    expect(result.error).toBeTruthy();
    expect(result.error?.field).toBe('url');
    expect(result.errorMessage).toContain('Server URL');
  });

  it('saves when endpoint validation succeeds', async () => {
    const server = createServer();
    const commit = jest.fn();
    const drafts = beginServerDraft({}, server);

    const successValidation: OpenApiValidationResult = {
      ok: true,
      normalizedInputUrl: 'https://mcp.example.com',
      resolvedSpecUrl: 'https://mcp.example.com/openapi.json',
      resolvedBaseUrl: 'https://mcp.example.com',
      spec: {
        openapi: '3.0.0',
        info: { title: 'Demo', version: '1.0.0' },
        paths: {
          '/health': {
            get: { operationId: 'healthCheck' },
          },
        },
      },
      tools: [
        {
          name: 'healthCheck',
          description: 'Check health',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
      ],
    };

    const result = await saveServerDraftWithValidation({
      drafts,
      server,
      commit,
      validateEndpoint: jest.fn(async () => successValidation),
    });

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({
      ...server,
      name: 'Server One',
      url: 'https://mcp.example.com',
      enabled: true,
      headers: {
        Authorization: 'Bearer persisted-token',
      },
    });
    expect(result.error).toBeNull();
    expect(result.errorMessage).toBeNull();
    expect(result.drafts[server.id]).toBeUndefined();
  });

  it('allows saving disabled servers without forcing endpoint validation', async () => {
    const server = {
      ...createServer(),
      enabled: false,
      url: 'https://broken.invalid-host',
    };
    const commit = jest.fn();
    const drafts = beginServerDraft({}, server);
    const validateEndpoint = jest.fn();

    const result = await saveServerDraftWithValidation({
      drafts,
      server,
      commit,
      validateEndpoint,
    });

    expect(validateEndpoint).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({
      ...server,
      name: 'Server One',
      url: 'https://broken.invalid-host',
      enabled: false,
      headers: {
        Authorization: 'Bearer persisted-token',
      },
    });
    expect(result.error).toBeNull();
    expect(result.errorMessage).toBeNull();
    expect(result.drafts[server.id]).toBeUndefined();
  });
});
