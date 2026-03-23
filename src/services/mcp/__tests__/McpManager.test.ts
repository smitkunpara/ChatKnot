import { McpManager } from '../McpManager';
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
  options: Partial<Pick<McpServerConfig, 'allowedTools' | 'autoApprovedTools' | 'enabled'>> = {}
): McpServerConfig => ({
  id,
  name,
  url: `https://${id}.example.com`,
  enabled: options.enabled ?? true,
  tools: [],
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

  it('sanitizes tool names and uses "__" for namespaces to satisfy OpenAI requirements', async () => {
    toolsByServerId['complex-server'] = [
      {
        name: 'get-user.details',
        description: 'Tool with dots',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'search',
        description: 'Collision tool',
        inputSchema: { type: 'object', properties: {} },
      },
    ];
    toolsByServerId['other-server'] = [
      {
        name: 'search',
        description: 'Collision tool',
        inputSchema: { type: 'object', properties: {} },
      },
    ];

    await McpManager.initialize([
      createServer('complex-server', 'Complex Server'),
      createServer('other-server', 'Other Server'),
    ]);

    const allTools = McpManager.getTools();
    const toolNames = allTools.map(t => t.name);

    expect(toolNames).toContain('get_user_details');
    expect(toolNames).toContain('complex_server__search');
    expect(toolNames).toContain('other_server__search');

    toolNames.forEach(name => {
      expect(name).toMatch(/^[a-zA-Z0-9_-]+$/);
    });
  });

  it('namespaces case-insensitive colliding tool names across servers', async () => {
    toolsByServerId['server-a'] = [
      {
        name: 'Search',
        description: 'Server A Search tool',
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

    const allToolNames = McpManager.getTools().map(tool => tool.name);
    expect(new Set(allToolNames).size).toBe(2);

    const runtimeStates = McpManager.getRuntimeStates();
    const alphaState = runtimeStates.find(state => state.serverId === 'server-a');
    const betaState = runtimeStates.find(state => state.serverId === 'server-b');

    expect(alphaState?.toolNames[0]).not.toBe(betaState?.toolNames[0]);

    allToolNames.forEach(name => {
      expect(name).toMatch(/^[a-zA-Z0-9_-]+$/);
    });
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
        allowedTools: ['other-tool'],
      }),
    ]);

    const policy = McpManager.getToolExecutionPolicy('search');

    expect(policy.found).toBe(true);
    expect(policy.autoAllow).toBe(false);
    expect(policy.enabled).toBe(false);

    await expect(McpManager.executeTool('search', { query: 'status' })).rejects.toThrow(
      'Tool search is disabled for this mode.'
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
        allowedTools: [],
      }),
    ]);

    const policy = McpManager.getToolExecutionPolicy('search');

    expect(policy.found).toBe(true);
    expect(policy.autoAllow).toBe(false);
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
        allowedTools: ['search'],
        autoApprovedTools: ['search'],
      }),
    ]);

    const policy = McpManager.getToolExecutionPolicy('search');

    expect(policy.found).toBe(true);
    expect(policy.enabled).toBe(true);
    expect(policy.autoAllow).toBe(true);
  });

  it('sets error state when server connection fails', async () => {
    const { McpClient } = require('../McpClient');
    (McpClient as jest.Mock).mockImplementationOnce((config: McpServerConfig) => ({
      connect: jest.fn(async () => { throw new Error('Connection refused'); }),
      disconnect: jest.fn(),
      getTools: jest.fn(() => []),
      getProtocol: jest.fn(() => 'mcp'),
      getOpenApiMetadata: jest.fn(() => null),
      getOpenApiContext: jest.fn(() => null),
      callTool: jest.fn(),
    }));

    await McpManager.initialize([
      createServer('failing-server', 'Failing Server'),
    ]);

    const state = McpManager.getRuntimeState('failing-server');
    expect(state?.status).toBe('error');
    expect(state?.error).toBe('Connection refused');
    expect(state?.toolsCount).toBe(0);
  });

  it('skips disabled servers during initialization', async () => {
    toolsByServerId['server-a'] = [
      {
        name: 'search',
        description: 'Server A search tool',
        inputSchema: { type: 'object', properties: {} },
      },
    ];

    await McpManager.initialize([
      createServer('server-a', 'Alpha Server', { enabled: true }),
      createServer('server-b', 'Beta Server', { enabled: false }),
    ]);

    const stateA = McpManager.getRuntimeState('server-a');
    const stateB = McpManager.getRuntimeState('server-b');

    expect(stateA?.status).toBe('connected');
    expect(stateB?.status).toBe('disabled');
    expect(clientsByServerId['server-b']).toBeUndefined();
  });

  it('notifies listeners on state changes and cleans up on unsubscribe', async () => {
    toolsByServerId['server-a'] = [
      {
        name: 'search',
        description: 'Server A search tool',
        inputSchema: { type: 'object', properties: {} },
      },
    ];

    const listener = jest.fn();
    const unsubscribe = McpManager.subscribe(listener);

    expect(listener).toHaveBeenCalledTimes(1);

    await McpManager.initialize([
      createServer('server-a', 'Alpha Server'),
    ]);

    expect(listener).toHaveBeenCalledTimes(3); // initial + connecting + connected
    unsubscribe();

    await McpManager.initialize([
      createServer('server-a', 'Alpha Server'),
    ]);

    // Should not be called again after unsubscribe
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('disconnects old clients on re-initialization', async () => {
    toolsByServerId['server-a'] = [
      {
        name: 'search',
        description: 'Server A search tool',
        inputSchema: { type: 'object', properties: {} },
      },
    ];

    await McpManager.initialize([
      createServer('server-a', 'Alpha Server'),
    ]);

    const oldClient = clientsByServerId['server-a'];

    await McpManager.initialize([
      createServer('server-a', 'Alpha Server v2'),
    ]);

    expect(oldClient.disconnect).toHaveBeenCalled();
  });

  it('returns undefined for unknown server runtime state', () => {
    expect(McpManager.getRuntimeState('nonexistent')).toBeUndefined();
  });

  it('returns not-found policy for unknown tool name', () => {
    const policy = McpManager.getToolExecutionPolicy('nonexistent_tool');
    expect(policy.found).toBe(false);
    expect(policy.enabled).toBe(false);
    expect(policy.autoAllow).toBe(false);
  });

  it('throws when executing a tool that does not exist', async () => {
    await expect(McpManager.executeTool('ghost', {})).rejects.toThrow('Tool ghost not found');
  });
});
