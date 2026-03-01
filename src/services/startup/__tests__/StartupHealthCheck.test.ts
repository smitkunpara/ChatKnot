import {
  applyHealthCheckReport,
  runStartupHealthCheck,
  HealthCheckReport,
} from '../StartupHealthCheck.ts';
import { LlmProviderConfig, McpServerConfig } from '../../../types';
import * as openApiValidation from '../../mcp/OpenApiValidationService';

const createProvider = (overrides: Partial<LlmProviderConfig> = {}): LlmProviderConfig => ({
  id: 'provider-1',
  name: 'Alpha',
  type: 'custom-openai',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'test-key',
  model: 'gpt-4.1-mini',
  availableModels: ['gpt-4.1-mini'],
  hiddenModels: [],
  enabled: true,
  ...overrides,
});

const createServer = (overrides: Partial<McpServerConfig> = {}): McpServerConfig => ({
  id: 'server-1',
  name: 'Alpha MCP',
  url: 'https://mcp.example.com',
  headers: {},
  enabled: true,
  tools: [],
  autoAllow: false,
  allowedTools: [],
  autoApprovedTools: [],
  ...overrides,
});

describe('StartupHealthCheck safety actions', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    (global as any).fetch = jest.fn();
  });

  it('turns off MCP and AI providers on connectivity failures and includes reason in warnings', async () => {
    jest.spyOn(openApiValidation, 'validateOpenApiEndpoint').mockResolvedValue({
      ok: false,
      error: {
        code: 'FETCH_FAILED',
        field: 'network',
        message: 'Unable to reach the server. Check URL, network connectivity, and SSL setup.',
      },
    });

    (global as any).fetch.mockRejectedValue(new Error('connect ETIMEDOUT api.example.com'));

    const report = await runStartupHealthCheck(
      [createServer()],
      [createProvider()],
      () => {}
    );

    expect(report.disabledMcpServers).toEqual(['server-1']);
    expect(report.disabledAiProviders).toEqual(['provider-1']);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('(alpha_mcp) is turned off due to'),
        expect.stringContaining('(alpha_ai_provider) is turned off due to'),
      ])
    );
  });

  it('keeps AI provider enabled for non-network errors and reports issue', async () => {
    jest.spyOn(openApiValidation, 'validateOpenApiEndpoint').mockResolvedValue({
      ok: true,
      normalizedInputUrl: 'https://mcp.example.com',
      resolvedSpecUrl: 'https://mcp.example.com/openapi.json',
      resolvedBaseUrl: 'https://mcp.example.com',
      spec: {
        openapi: '3.0.0',
        info: { title: 'Demo', version: '1.0.0' },
        paths: {
          '/status': {
            get: { operationId: 'status' },
          },
        },
      },
      tools: [
        {
          name: 'status',
          description: 'status',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
      ],
    });

    (global as any).fetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({}),
    });

    const report = await runStartupHealthCheck(
      [createServer()],
      [createProvider()],
      () => {}
    );

    expect(report.disabledAiProviders).toEqual([]);
    expect(report.warnings).toContain(
      'AI provider "Alpha" check failed: Failed to fetch models (401 Unauthorized).'
    );
  });

  it('applies disabled AI/MCP actions to settings updates', () => {
    const updateMcpServer = jest.fn();
    const updateProvider = jest.fn();
    const setModelVisibility = jest.fn();

    const report: HealthCheckReport = {
      mcpResults: [],
      aiResults: [],
      warnings: [],
      disabledMcpServers: ['server-1'],
      disabledAiProviders: ['provider-1'],
      removedVisibleModels: [],
    };

    const servers = [createServer()];
    const providers = [createProvider()];

    applyHealthCheckReport(
      report,
      servers,
      providers,
      updateMcpServer,
      updateProvider,
      setModelVisibility
    );

    expect(updateMcpServer).toHaveBeenCalledWith({
      ...servers[0],
      enabled: false,
    });
    expect(updateProvider).toHaveBeenCalledWith({
      ...providers[0],
      enabled: false,
    });
  });
});
