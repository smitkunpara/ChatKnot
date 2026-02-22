import { McpManager } from '../McpManager.ts';
import { McpServerConfig, McpToolSchema } from '../../../types';

const toolsByServerId: Record<string, McpToolSchema[]> = {};
const clientsByServerId: Record<string, any> = {};

jest.mock('../McpClient', () => ({
  McpClient: jest.fn().mockImplementation((config: McpServerConfig) => {
    const client = {
      connect: jest.fn(async () => undefined),
      disconnect: jest.fn(() => undefined),
      getTools: jest.fn(() => toolsByServerId[config.id] || []),
      getProtocol: jest.fn(() => 'openapi'),
      getOpenApiMetadata: jest.fn(() => null),
      getOpenApiContext: jest.fn(() => null),
      callTool: jest.fn(async (name: string, args: any) => ({
        serverId: config.id,
        name,
        args,
      })),
    };

    clientsByServerId[config.id] = client;
    return client;
  }),
}));

const createServer = (
  id: string,
  name: string,
  options: Partial<Pick<McpServerConfig, 'autoAllow' | 'allowedTools' | 'autoApprovedTools'>> = {}
): McpServerConfig => ({
  id,
  name,
  url: `https://${id}.example.com`,
  enabled: true,
  tools: [],
  autoAllow: options.autoAllow ?? false,
  allowedTools: options.allowedTools ?? [],
  autoApprovedTools: options.autoApprovedTools ?? [],
});

describe('McpManager', () => {
  beforeEach(async () => {
    Object.keys(toolsByServerId).forEach(key => delete toolsByServerId[key]);
    Object.keys(clientsByServerId).forEach(key => delete clientsByServerId[key]);
    await McpManager.initialize([]);
  });

  it('namespaces colliding tool names across servers and executes against the correct server tool', async () => {
    toolsByServerId['server-a'] = [
      {
        name: 'search',
        description: 'Server A search tool',
        inputSchema: { type: 'object', properties: {} },
      },
    ];
    toolsByServerId['server-b'] = [
      {
        name: 'search',
        description: 'Server B search tool',
        inputSchema: { type: 'object', properties: {} },
      },
    ];

    await McpManager.initialize([
      createServer('server-a', 'Alpha Server'),
      createServer('server-b', 'Beta Server'),
    ]);

    const runtimeStates = McpManager.getRuntimeStates();
    const alphaState = runtimeStates.find(state => state.serverId === 'server-a');
    const betaState = runtimeStates.find(state => state.serverId === 'server-b');

    expect(alphaState?.toolNames.length).toBe(1);
    expect(betaState?.toolNames.length).toBe(1);
    expect(alphaState?.toolNames[0]).not.toBe(betaState?.toolNames[0]);

    const allToolNames = McpManager.getTools().map(tool => tool.name);
    expect(new Set(allToolNames).size).toBe(2);

    const alphaToolName = alphaState?.toolNames[0] as string;
    await McpManager.executeTool(alphaToolName, { query: 'status' });

    expect(clientsByServerId['server-a'].callTool).toHaveBeenCalledWith('search', { query: 'status' });
    expect(clientsByServerId['server-b'].callTool).not.toHaveBeenCalled();
  });

  it('keeps non-colliding tool names unchanged', async () => {
    toolsByServerId['server-a'] = [
      {
        name: 'search',
        description: 'Server A search tool',
        inputSchema: { type: 'object', properties: {} },
      },
    ];
    toolsByServerId['server-b'] = [
      {
        name: 'fetch_users',
        description: 'Server B users tool',
        inputSchema: { type: 'object', properties: {} },
      },
    ];

    await McpManager.initialize([
      createServer('server-a', 'Alpha Server'),
      createServer('server-b', 'Beta Server'),
    ]);

    const toolNames = McpManager.getTools().map(tool => tool.name).sort();

    expect(toolNames).toEqual(['fetch_users', 'search']);
  });

  it('exposes tool execution policy and blocks disabled tools', async () => {
    toolsByServerId['server-a'] = [
      {
        name: 'search',
        description: 'Server A search tool',
        inputSchema: { type: 'object', properties: {} },
      },
    ];

    await McpManager.initialize([
      createServer('server-a', 'Alpha Server', {
        autoAllow: false,
        allowedTools: ['other-tool'],
      }),
    ]);

    const policy = McpManager.getToolExecutionPolicy('search');

    expect(policy.found).toBe(true);
    expect(policy.autoAllow).toBe(false);
    expect(policy.enabled).toBe(false);

    await expect(McpManager.executeTool('search', { query: 'status' })).rejects.toThrow(
      'Tool search is disabled in MCP settings.'
    );
  });

  it('treats empty allowedTools as all enabled', async () => {
    toolsByServerId['server-a'] = [
      {
        name: 'search',
        description: 'Server A search tool',
        inputSchema: { type: 'object', properties: {} },
      },
    ];

    await McpManager.initialize([
      createServer('server-a', 'Alpha Server', {
        autoAllow: true,
        allowedTools: [],
      }),
    ]);

    const policy = McpManager.getToolExecutionPolicy('search');

    expect(policy.found).toBe(true);
    expect(policy.autoAllow).toBe(true);
    expect(policy.enabled).toBe(true);

    await McpManager.executeTool('search', { query: 'status' });
    expect(clientsByServerId['server-a'].callTool).toHaveBeenCalledWith('search', { query: 'status' });
  });

  it('supports per-tool auto-approve even when global autoAllow is off', async () => {
    toolsByServerId['server-a'] = [
      {
        name: 'search',
        description: 'Server A search tool',
        inputSchema: { type: 'object', properties: {} },
      },
    ];

    await McpManager.initialize([
      createServer('server-a', 'Alpha Server', {
        autoAllow: false,
        allowedTools: ['search'],
        autoApprovedTools: ['search'],
      }),
    ]);

    const policy = McpManager.getToolExecutionPolicy('search');

    expect(policy.found).toBe(true);
    expect(policy.enabled).toBe(true);
    expect(policy.autoAllow).toBe(true);
  });
});
