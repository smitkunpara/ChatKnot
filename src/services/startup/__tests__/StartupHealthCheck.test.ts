import {
  applyHealthCheckReport,
  runStartupHealthCheck,
  reconcileMcpTools,
  HealthCheckReport,
} from '../StartupHealthCheck';
import { LlmProviderConfig, McpServerConfig, McpToolSchema } from '../../../types';
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
  allowedTools: [],
  autoApprovedTools: [],
  ...overrides,
});

const makeTool = (name: string): McpToolSchema => ({
  name,
  description: `${name} tool`,
  inputSchema: { type: 'object', properties: {}, required: [] },
});

describe('StartupHealthCheck safety actions', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    (global as any).fetch = jest.fn();
  });

  it('passes MCP token to endpoint validation during health checks', async () => {
    const validateSpy = jest.spyOn(openApiValidation, 'validateOpenApiEndpoint').mockResolvedValue({
      ok: true,
      normalizedInputUrl: 'https://mcp.example.com',
      resolvedSpecUrl: 'https://mcp.example.com/openapi.json',
      resolvedBaseUrl: 'https://mcp.example.com',
      spec: {
        openapi: '3.0.0',
        info: { title: 'Demo', version: '1.0.0' },
        paths: { '/status': { get: { operationId: 'status' } } },
      },
      tools: [{ name: 'status', description: 'status', inputSchema: { type: 'object', properties: {} } }],
    });

    (global as any).fetch.mockRejectedValue(new Error('connect ETIMEDOUT api.example.com'));

    await runStartupHealthCheck(
      [createServer({ token: 'server-secret-token' })],
      [createProvider()],
      () => { }
    );

    expect(validateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'server-secret-token',
      })
    );
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
      () => { }
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
        paths: { '/status': { get: { operationId: 'status' } } },
      },
      tools: [{ name: 'status', description: 'status', inputSchema: { type: 'object', properties: {} } }],
    });

    (global as any).fetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({}),
      text: async () => '',
    });

    const report = await runStartupHealthCheck(
      [createServer()],
      [createProvider()],
      () => { }
    );

    expect(report.disabledAiProviders).toEqual([]);
    const aiWarning = report.warnings.find(w => w.includes('AI provider'));
    expect(aiWarning).toBeDefined();
    expect(aiWarning).toContain('401');
  });

  it('applies disabled AI/MCP actions to settings updates', () => {
    const updateMcpServer = jest.fn();
    const updateProvider = jest.fn();

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
      updateProvider
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

  it('does not disable providers on 4xx errors', async () => {
    jest.spyOn(openApiValidation, 'validateOpenApiEndpoint').mockResolvedValue({
      ok: false,
      error: { code: 'HTTP_STATUS', field: 'headers', message: 'Endpoint returned HTTP 403 (Forbidden).' },
    });

    (global as any).fetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({}),
    });

    const report = await runStartupHealthCheck(
      [createServer()],
      [createProvider()],
      () => { }
    );

    expect(report.disabledMcpServers).toEqual([]);
    expect(report.disabledAiProviders).toEqual([]);
  });

  it('strips credential-like tokens from warning messages', async () => {
    jest.spyOn(openApiValidation, 'validateOpenApiEndpoint').mockResolvedValue({
      ok: false,
      error: {
        code: 'FETCH_FAILED',
        field: 'network',
        message: 'Failed to fetch. api_key=sk-secret123 connection refused.',
      },
    });

    (global as any).fetch.mockRejectedValue(new Error('connect ETIMEDOUT'));

    const report = await runStartupHealthCheck(
      [createServer()],
      [createProvider({ apiKey: '', baseUrl: '' })],
      () => { }
    );

    const mcpWarning = report.warnings.find(w => w.includes('alpha_mcp'));
    expect(mcpWarning).toBeDefined();
    expect(mcpWarning).not.toContain('sk-secret123');
  });

  it('normalizes error messages by stripping known prefixes', async () => {
    jest.spyOn(openApiValidation, 'validateOpenApiEndpoint').mockResolvedValue({
      ok: false,
      error: {
        code: 'FETCH_FAILED',
        field: 'network',
        message: 'Unable to fetch models: connection refused.',
      },
    });

    (global as any).fetch.mockRejectedValue(new Error('Failed to fetch models from https://api.example.com (ENOTFOUND)'));

    const report = await runStartupHealthCheck(
      [createServer()],
      [createProvider()],
      () => { }
    );

    const mcpWarning = report.warnings.find(w => w.includes('alpha_mcp'));
    expect(mcpWarning).toBeDefined();
    expect(mcpWarning).not.toContain('Unable to fetch models:');
    const aiWarning = report.warnings.find(w => w.includes('alpha_ai_provider'));
    expect(aiWarning).toBeDefined();
    expect(aiWarning).not.toContain('Failed to fetch models from');
  });

  it('handles empty or whitespace-only error messages with fallback', async () => {
    jest.spyOn(openApiValidation, 'validateOpenApiEndpoint').mockResolvedValue({
      ok: false,
      error: {
        code: 'FETCH_FAILED',
        field: 'network',
        message: '   ',
      },
    });

    (global as any).fetch.mockRejectedValue(new Error(''));

    const report = await runStartupHealthCheck(
      [createServer()],
      [createProvider()],
      () => { }
    );

    const mcpWarning = report.warnings.find(w => w.includes('MCP "Alpha MCP"'));
    expect(mcpWarning).toBeDefined();
    expect(mcpWarning).toContain('unknown connectivity issue');
    expect(report.disabledMcpServers).toEqual([]);
  });

  it('strips multiple credential patterns from warnings', async () => {
    jest.spyOn(openApiValidation, 'validateOpenApiEndpoint').mockResolvedValue({
      ok: false,
      error: {
        code: 'FETCH_FAILED',
        field: 'network',
        message: 'connection refused. token=abc123 and secret=xyz789 authorization=bearer fail.',
      },
    });

    (global as any).fetch.mockRejectedValue(new Error('connect ETIMEDOUT'));

    const report = await runStartupHealthCheck(
      [createServer()],
      [createProvider({ apiKey: '', baseUrl: '' })],
      () => { }
    );

    const mcpWarning = report.warnings.find(w => w.includes('alpha_mcp'));
    expect(mcpWarning).toBeDefined();
    expect(mcpWarning).not.toContain('abc123');
    expect(mcpWarning).not.toContain('xyz789');
  });

  it('strips Authorization header style credentials from warnings', async () => {
    jest.spyOn(openApiValidation, 'validateOpenApiEndpoint').mockResolvedValue({
      ok: false,
      error: {
        code: 'FETCH_FAILED',
        field: 'network',
        message: 'HTTP 503 upstream failure. Authorization: Bearer sk-live-very-secret token:abc123',
      },
    });

    (global as any).fetch.mockRejectedValue(new Error('connect ETIMEDOUT'));

    const report = await runStartupHealthCheck(
      [createServer()],
      [createProvider({ apiKey: '', baseUrl: '' })],
      () => { }
    );

    const mcpWarning = report.warnings.find(w => w.includes('alpha_mcp'));
    expect(mcpWarning).toBeDefined();
    expect(mcpWarning).not.toContain('sk-live-very-secret');
    expect(mcpWarning).not.toContain('abc123');
  });

  it('classifies 502 and 503 as network issues (disables provider)', async () => {
    jest.spyOn(openApiValidation, 'validateOpenApiEndpoint').mockResolvedValue({
      ok: true,
      normalizedInputUrl: 'https://mcp.example.com',
      resolvedSpecUrl: 'https://mcp.example.com/openapi.json',
      resolvedBaseUrl: 'https://mcp.example.com',
      spec: { openapi: '3.0.0', info: { title: 'D', version: '1' }, paths: {} },
      tools: [],
    });

    (global as any).fetch.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => ({}),
      text: async () => '',
    });

    const report = await runStartupHealthCheck(
      [createServer()],
      [createProvider()],
      () => { }
    );

    expect(report.disabledAiProviders).toEqual(['provider-1']);
  });

  it('handles timeout by disabling both MCP and AI on network failure', async () => {
    jest.spyOn(openApiValidation, 'validateOpenApiEndpoint').mockRejectedValue(
      new Error('MCP Alpha MCP: network timeout after 15s')
    );

    (global as any).fetch.mockRejectedValue(
      new Error('AI Alpha: network timeout after 15s')
    );

    const report = await runStartupHealthCheck(
      [createServer()],
      [createProvider()],
      () => { }
    );

    expect(report.disabledMcpServers).toEqual(['server-1']);
    expect(report.disabledAiProviders).toEqual(['provider-1']);
  });

  it('generates properly formatted warning labels from server names', async () => {
    jest.spyOn(openApiValidation, 'validateOpenApiEndpoint').mockResolvedValue({
      ok: false,
      error: { code: 'FETCH_FAILED', field: 'network', message: 'connection refused' },
    });

    (global as any).fetch.mockRejectedValue(new Error('ETIMEDOUT'));

    const report = await runStartupHealthCheck(
      [createServer({ name: 'My Custom Server!' })],
      [createProvider({ name: 'OpenAI Provider' })],
      () => { }
    );

    expect(report.warnings.some(w => w.includes('(my_custom_server_mcp)'))).toBe(true);
    expect(report.warnings.some(w => w.includes('(openai_provider_ai_provider)'))).toBe(true);
  });
});

describe('reconcileMcpTools', () => {
  it('removes tools that were removed from server from allowedTools and autoApprovedTools', () => {
    const server = createServer({
      tools: [makeTool('keep'), makeTool('removed')],
      allowedTools: ['keep', 'removed'],
      autoApprovedTools: ['keep', 'removed'],
    });

    const result = reconcileMcpTools(
      server,
      [makeTool('keep'), makeTool('added')],
      ['removed'],
      ['keep', 'added']
    );

    expect(result.tools).toEqual([makeTool('keep'), makeTool('added')]);
    expect(result.allowedTools).toEqual(['keep']);
    expect(result.autoApprovedTools).toEqual(['keep']);
  });

  it('disables new tools by default when allowedTools was non-empty', () => {
    const server = createServer({
      tools: [makeTool('existing')],
      allowedTools: ['existing'],
    });

    const result = reconcileMcpTools(
      server,
      [makeTool('existing'), makeTool('new-tool')],
      [],
      ['existing', 'new-tool']
    );

    expect(result.allowedTools).toEqual(['existing']);
    expect(result.allowedTools).not.toContain('new-tool');
  });

  it('keeps prior tools enabled when allowedTools was empty (all-enabled) and new tools appear', () => {
    const server = createServer({
      tools: [makeTool('old1'), makeTool('old2')],
      allowedTools: [],
    });

    const result = reconcileMcpTools(
      server,
      [makeTool('old1'), makeTool('old2'), makeTool('new1')],
      [],
      ['old1', 'old2', 'new1']
    );

    expect(result.allowedTools).toEqual(['old1', 'old2']);
    expect(result.allowedTools).not.toContain('new1');
  });

  it('cleans allowedTools entries for tools no longer in currentTools', () => {
    const server = createServer({
      tools: [makeTool('a'), makeTool('b'), makeTool('c')],
      allowedTools: ['a', 'b', 'c', 'phantom'],
    });

    const result = reconcileMcpTools(
      server,
      [makeTool('a')],
      ['b', 'c'],
      ['a']
    );

    expect(result.allowedTools).toEqual(['a']);
  });

  it('does not modify server when tools are unchanged', () => {
    const server = createServer({
      tools: [makeTool('same')],
      allowedTools: ['same'],
      autoApprovedTools: ['same'],
    });

    const result = reconcileMcpTools(
      server,
      [makeTool('same')],
      [],
      ['same']
    );

    expect(result.tools).toEqual([makeTool('same')]);
    expect(result.allowedTools).toEqual(['same']);
    expect(result.autoApprovedTools).toEqual(['same']);
  });
});

describe('applyHealthCheckReport MCP tool reconciliation', () => {
  it('updates server tools via reconcileMcpTools', () => {
    const updateMcpServer = jest.fn();
    const updateProvider = jest.fn();

    const server = createServer({
      tools: [makeTool('old')],
      allowedTools: ['old'],
    });

    const report: HealthCheckReport = {
      mcpResults: [{
        serverId: 'server-1',
        serverName: 'Alpha MCP',
        reachable: true,
        toolsChanged: true,
        removedTools: ['old'],
        currentTools: ['new-tool'],
        validatedTools: [makeTool('new-tool')],
      }],
      aiResults: [],
      warnings: [],
      disabledMcpServers: [],
      disabledAiProviders: [],
      removedVisibleModels: [],
    };

    applyHealthCheckReport(report, [server], [], updateMcpServer, updateProvider);

    expect(updateMcpServer).toHaveBeenCalledTimes(1);
    const updated = updateMcpServer.mock.calls[0][0];
    expect(updated.tools).toEqual([makeTool('new-tool')]);
    expect(updated.allowedTools).toEqual([]);
  });

  it('skips MCP results that are not reachable', () => {
    const updateMcpServer = jest.fn();

    const report: HealthCheckReport = {
      mcpResults: [{
        serverId: 'server-1',
        serverName: 'Alpha MCP',
        reachable: false,
        toolsChanged: false,
        removedTools: [],
        currentTools: [],
      }],
      aiResults: [],
      warnings: [],
      disabledMcpServers: [],
      disabledAiProviders: [],
      removedVisibleModels: [],
    };

    applyHealthCheckReport(report, [createServer()], [], updateMcpServer, jest.fn());
    expect(updateMcpServer).not.toHaveBeenCalled();
  });

  it('reconciles tools for servers only present in the passed list (mode-only servers)', () => {
    const updateMcpServer = jest.fn();
    const globalServers = [createServer({ id: 'global-1', name: 'Global' })];
    const modeOnlyServer = createServer({ id: 'mode-1', name: 'Mode Only' });
    const mergedServers = [...globalServers, modeOnlyServer];

    const report: HealthCheckReport = {
      mcpResults: [{
        serverId: 'mode-1',
        serverName: 'Mode Only',
        reachable: true,
        toolsChanged: true,
        removedTools: [],
        currentTools: ['tool-a'],
        validatedTools: [makeTool('tool-a')],
      }],
      aiResults: [],
      warnings: [],
      disabledMcpServers: [],
      disabledAiProviders: [],
      removedVisibleModels: [],
    };

    applyHealthCheckReport(report, mergedServers, [], updateMcpServer, jest.fn());

    expect(updateMcpServer).toHaveBeenCalledTimes(1);
    const updated = updateMcpServer.mock.calls[0][0];
    expect(updated.id).toBe('mode-1');
    expect(updated.tools).toEqual([makeTool('tool-a')]);
  });
});

describe('applyHealthCheckReport AI model reconciliation', () => {
  it('hides newly added models by default', () => {
    const updateProvider = jest.fn();
    const provider = createProvider({
      availableModels: ['gpt-4'],
      hiddenModels: [],
    });

    const report: HealthCheckReport = {
      mcpResults: [],
      aiResults: [{
        providerId: 'provider-1',
        providerName: 'Alpha',
        reachable: true,
        modelsChanged: true,
        removedModels: [],
        currentModels: ['gpt-4', 'gpt-5'],
        capabilities: {},
      }],
      warnings: [],
      disabledMcpServers: [],
      disabledAiProviders: [],
      removedVisibleModels: [],
    };

    applyHealthCheckReport(report, [], [provider], jest.fn(), updateProvider);

    expect(updateProvider).toHaveBeenCalledTimes(1);
    const updated = updateProvider.mock.calls[0][0];
    expect(updated.hiddenModels).toContain('gpt-5');
    expect(updated.hiddenModels).not.toContain('gpt-4');
  });

  it('cleans removed models from hidden list', () => {
    const updateProvider = jest.fn();
    const provider = createProvider({
      availableModels: ['gpt-4', 'gpt-3.5'],
      hiddenModels: ['gpt-3.5'],
    });

    const report: HealthCheckReport = {
      mcpResults: [],
      aiResults: [{
        providerId: 'provider-1',
        providerName: 'Alpha',
        reachable: true,
        modelsChanged: true,
        removedModels: ['gpt-3.5'],
        currentModels: ['gpt-4'],
        capabilities: {},
      }],
      warnings: [],
      disabledMcpServers: [],
      disabledAiProviders: [],
      removedVisibleModels: [],
    };

    applyHealthCheckReport(report, [], [provider], jest.fn(), updateProvider);

    const updated = updateProvider.mock.calls[0][0];
    expect(updated.hiddenModels).not.toContain('gpt-3.5');
  });

  it('skips AI results that are not reachable', () => {
    const updateProvider = jest.fn();

    const report: HealthCheckReport = {
      mcpResults: [],
      aiResults: [{
        providerId: 'provider-1',
        providerName: 'Alpha',
        reachable: false,
        modelsChanged: false,
        removedModels: [],
        currentModels: [],
      }],
      warnings: [],
      disabledMcpServers: [],
      disabledAiProviders: [],
      removedVisibleModels: [],
    };

    applyHealthCheckReport(report, [], [createProvider()], jest.fn(), updateProvider);
    expect(updateProvider).not.toHaveBeenCalled();
  });

  it('filters capabilities to only include current models', () => {
    const updateProvider = jest.fn();
    const provider = createProvider({
      availableModels: ['gpt-4'],
      modelCapabilities: {
        'gpt-4': { vision: true, tools: true, fileInput: false },
        'old-model': { vision: false, tools: false, fileInput: false },
      },
    });

    const report: HealthCheckReport = {
      mcpResults: [],
      aiResults: [{
        providerId: 'provider-1',
        providerName: 'Alpha',
        reachable: true,
        modelsChanged: false,
        removedModels: [],
        currentModels: ['gpt-4'],
        capabilities: {
          'gpt-4': { vision: true, tools: true, fileInput: true },
        },
      }],
      warnings: [],
      disabledMcpServers: [],
      disabledAiProviders: [],
      removedVisibleModels: [],
    };

    applyHealthCheckReport(report, [], [provider], jest.fn(), updateProvider);

    const updated = updateProvider.mock.calls[0][0];
    expect(updated.modelCapabilities).not.toHaveProperty('old-model');
    expect(updated.modelCapabilities['gpt-4'].fileInput).toBe(true);
  });

  it('updates provider when only capabilities change (model list unchanged)', () => {
    const updateProvider = jest.fn();
    const provider = createProvider({
      availableModels: ['gpt-4'],
      modelCapabilities: {
        'gpt-4': { vision: false, tools: true, fileInput: false },
      },
    });

    const report: HealthCheckReport = {
      mcpResults: [],
      aiResults: [{
        providerId: 'provider-1',
        providerName: 'Alpha',
        reachable: true,
        modelsChanged: false,
        removedModels: [],
        currentModels: ['gpt-4'],
        capabilities: {
          'gpt-4': { vision: true, tools: true, fileInput: true },
        },
      }],
      warnings: [],
      disabledMcpServers: [],
      disabledAiProviders: [],
      removedVisibleModels: [],
    };

    applyHealthCheckReport(report, [], [provider], jest.fn(), updateProvider);

    expect(updateProvider).toHaveBeenCalledTimes(1);
    const updated = updateProvider.mock.calls[0][0];
    expect(updated.modelCapabilities['gpt-4'].vision).toBe(true);
    expect(updated.modelCapabilities['gpt-4'].fileInput).toBe(true);
  });

  it('skips provider update when neither models nor capabilities changed', () => {
    const updateProvider = jest.fn();
    const provider = createProvider({
      availableModels: ['gpt-4'],
      modelCapabilities: {
        'gpt-4': { vision: true, tools: true, fileInput: false },
      },
    });

    const report: HealthCheckReport = {
      mcpResults: [],
      aiResults: [{
        providerId: 'provider-1',
        providerName: 'Alpha',
        reachable: true,
        modelsChanged: false,
        removedModels: [],
        currentModels: ['gpt-4'],
        capabilities: {
          'gpt-4': { vision: true, tools: true, fileInput: false },
        },
      }],
      warnings: [],
      disabledMcpServers: [],
      disabledAiProviders: [],
      removedVisibleModels: [],
    };

    applyHealthCheckReport(report, [], [provider], jest.fn(), updateProvider);

    expect(updateProvider).not.toHaveBeenCalled();
  });

  it('cleans hidden models that were removed from provider', () => {
    const updateProvider = jest.fn();
    const provider = createProvider({
      availableModels: ['gpt-4', 'gpt-3.5-turbo'],
      hiddenModels: ['gpt-3.5-turbo', 'old-hidden-model'],
    });

    const report: HealthCheckReport = {
      mcpResults: [],
      aiResults: [{
        providerId: 'provider-1',
        providerName: 'Alpha',
        reachable: true,
        modelsChanged: true,
        removedModels: ['gpt-3.5-turbo'],
        currentModels: ['gpt-4'],
        capabilities: {},
      }],
      warnings: [],
      disabledMcpServers: [],
      disabledAiProviders: [],
      removedVisibleModels: [],
    };

    applyHealthCheckReport(report, [], [provider], jest.fn(), updateProvider);

    const updated = updateProvider.mock.calls[0][0];
    expect(updated.hiddenModels).not.toContain('gpt-3.5-turbo');
    expect(updated.hiddenModels).not.toContain('old-hidden-model');
  });
});
