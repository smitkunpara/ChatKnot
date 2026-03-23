import { McpClient } from '../McpClient';
import { validateOpenApiEndpoint } from '../OpenApiValidationService';

jest.mock('../OpenApiValidationService');

jest.mock('react-native-uuid', () => ({ v4: () => 'test-uuid' }));

// EventSource mock
jest.mock('react-native-sse', () => {
  return jest.fn().mockImplementation(() => ({
    addEventListener: jest.fn(),
    close: jest.fn(),
  }));
});

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('McpClient OpenAPI execution paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  const setupOpenApiClient = async (tools: any[]) => {
    (validateOpenApiEndpoint as jest.Mock).mockResolvedValue({
      ok: true,
      spec: { info: { title: 'Test API' }, servers: [{ url: 'http://test.com' }] },
      tools,
      resolvedBaseUrl: 'http://test.com',
      normalizedInputUrl: 'http://test.com/openapi.json',
    });

    const client = new McpClient({
      id: 'test',
      name: 'test',
      url: 'http://test.com/openapi.json',
      enabled: true,
      tools: [],
      allowedTools: [],
    });
    await client.connect();
    return client;
  };

  it('routes parameters correctly for GET requests (query vs path)', async () => {
    const client = await setupOpenApiClient([
      {
        name: 'getUser',
        _meta: { method: 'get', path: '/users/{id}', baseUrl: 'http://test.com' },
      },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true }),
    });

    await client.callTool('getUser', { id: '123', include_details: 'true' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test.com/users/123?include_details=true',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('routes parameters correctly for POST requests (body vs path)', async () => {
    const client = await setupOpenApiClient([
      {
        name: 'createUser',
        _meta: { method: 'post', path: '/orgs/{orgId}/users', baseUrl: 'http://test.com' },
      },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true }),
    });

    await client.callTool('createUser', { orgId: 'org1', name: 'Alice', role: 'admin' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test.com/orgs/org1/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Alice', role: 'admin' }),
      })
    );
  });

  it('sanitizes large error payloads (top-level)', async () => {
    const client = await setupOpenApiClient([
      {
        name: 'failingTool',
        _meta: { method: 'get', path: '/fail', baseUrl: 'http://test.com' },
      },
    ]);

    const massiveString = 'A'.repeat(5000);
    const mockErrorData = {
      message: massiveString,
      stack: 'Error at line 1...',
      details: {
        trace: 'Something',
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => JSON.stringify(mockErrorData),
    });

    try {
      await client.callTool('failingTool', {});
      fail('Should have thrown');
    } catch (e: any) {
      expect(e.data).toBeDefined();
      expect(e.data.message.length).toBeLessThan(5000);
      expect(e.data.message).toContain('[truncated]');
      expect(e.data.stack).toBeUndefined();
    }
  });

  it('sanitizes large string error bodies', async () => {
    const client = await setupOpenApiClient([
      {
        name: 'failingTool',
        _meta: { method: 'get', path: '/fail', baseUrl: 'http://test.com' },
      },
    ]);

    const massiveString = 'A'.repeat(5000);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => massiveString,
    });

    try {
      await client.callTool('failingTool', {});
      fail('Should have thrown');
    } catch (e: any) {
      expect(e.data).toBeDefined();
      expect(e.data.body).toBeDefined();
      expect(e.data.body.length).toBeLessThan(5000);
      expect(e.data.body).toContain('[truncated]');
    }
  });

  it('recursively sanitizes stack and trace in nested objects', async () => {
    const client = await setupOpenApiClient([
      {
        name: 'failingTool',
        _meta: { method: 'get', path: '/fail', baseUrl: 'http://test.com' },
      },
    ]);

    const mockErrorData = {
      message: 'top-level error',
      stack: 'top-level stack',
      details: {
        stack: 'nested stack that should be removed',
        trace: 'nested trace that should be removed',
        inner: {
          stack: 'deeply nested stack',
          info: 'keep this',
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => JSON.stringify(mockErrorData),
    });

    try {
      await client.callTool('failingTool', {});
      fail('Should have thrown');
    } catch (e: any) {
      expect(e.data.stack).toBeUndefined();
      expect(e.data.details.stack).toBeUndefined();
      expect(e.data.details.trace).toBeUndefined();
      expect(e.data.details.inner.stack).toBeUndefined();
      expect(e.data.details.inner.info).toBe('keep this');
    }
  });

  it('sanitizes arrays of objects recursively', async () => {
    const client = await setupOpenApiClient([
      {
        name: 'failingTool',
        _meta: { method: 'get', path: '/fail', baseUrl: 'http://test.com' },
      },
    ]);

    const mockErrorData = {
      errors: [
        { message: 'err1', stack: 'stack1' },
        { message: 'err2', trace: 'trace2' },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => JSON.stringify(mockErrorData),
    });

    try {
      await client.callTool('failingTool', {});
      fail('Should have thrown');
    } catch (e: any) {
      expect(e.data.errors[0].stack).toBeUndefined();
      expect(e.data.errors[0].message).toBe('err1');
      expect(e.data.errors[1].trace).toBeUndefined();
      expect(e.data.errors[1].message).toBe('err2');
    }
  });

  it('truncates error payloads that exceed max depth', async () => {
    const client = await setupOpenApiClient([
      {
        name: 'failingTool',
        _meta: { method: 'get', path: '/fail', baseUrl: 'http://test.com' },
      },
    ]);

    // Build a 15-level deep nested object
    let deep: any = { value: 'bottom' };
    for (let i = 0; i < 15; i++) {
      deep = { level: i, nested: deep };
    }

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ message: 'error', details: deep }),
    });

    try {
      await client.callTool('failingTool', {});
      fail('Should have thrown');
    } catch (e: any) {
      expect(e.data).toBeDefined();
      expect(e.data.message).toBe('error');

      // Walk down the nested structure to verify max depth marker
      let current = e.data.details;
      let foundMaxDepth = false;
      for (let i = 0; i < 20; i++) {
        if (current === '[max depth exceeded]') {
          foundMaxDepth = true;
          break;
        }
        current = current?.nested;
      }
      expect(foundMaxDepth).toBe(true);
    }
  });

  it('disconnects cleanly', async () => {
    const client = await setupOpenApiClient([]);

    client.disconnect();

    // Should be able to call disconnect multiple times without error
    client.disconnect();
  });

  it('throws when calling tool that does not exist in OpenAPI mode', async () => {
    const client = await setupOpenApiClient([
      {
        name: 'existingTool',
        _meta: { method: 'get', path: '/ok', baseUrl: 'http://test.com' },
      },
    ]);

    await expect(client.callTool('nonexistent', {})).rejects.toThrow('Tool nonexistent not found or invalid');
  });

  it('returns non-JSON responses as wrapped text content', async () => {
    (validateOpenApiEndpoint as jest.Mock).mockResolvedValue({
      ok: true,
      spec: { info: { title: 'Test API' }, servers: [{ url: 'http://test.com' }] },
      tools: [
        {
          name: 'getText',
          _meta: { method: 'get', path: '/text', baseUrl: 'http://test.com' },
        },
      ],
      resolvedBaseUrl: 'http://test.com',
      normalizedInputUrl: 'http://test.com/openapi.json',
    });

    const client = new McpClient({
      id: 'test',
      name: 'test',
      url: 'http://test.com/openapi.json',
      enabled: true,
      tools: [],
      allowedTools: [],
    });
    await client.connect();

    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'Hello, world!',
      json: async () => ({}),
    });

    const result = await client.callTool('getText', {});
    expect(result).toEqual({
      content: [{ type: 'text', text: 'Hello, world!' }],
    });

    mockFetch.mockReset();
  });

  it('includes auth headers in OpenAPI tool calls when token is configured', async () => {
    (validateOpenApiEndpoint as jest.Mock).mockResolvedValue({
      ok: true,
      spec: { info: { title: 'Test API' }, servers: [{ url: 'http://test.com' }] },
      tools: [
        {
          name: 'getItems',
          _meta: { method: 'get', path: '/items', baseUrl: 'http://test.com' },
        },
      ],
      resolvedBaseUrl: 'http://test.com',
      normalizedInputUrl: 'http://test.com/openapi.json',
    });

    const client = new McpClient({
      id: 'test',
      name: 'test',
      url: 'http://test.com/openapi.json',
      enabled: true,
      token: 'my-secret-token',
      tools: [],
      allowedTools: [],
    });
    await client.connect();

    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ items: [] }),
      text: async () => '',
    });

    await client.callTool('getItems', {});

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test.com/items',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-secret-token',
        }),
      })
    );

    mockFetch.mockReset();
  });

  it('does not override manually configured Authorization header with token', async () => {
    (validateOpenApiEndpoint as jest.Mock).mockResolvedValue({
      ok: true,
      spec: { info: { title: 'Test API' }, servers: [{ url: 'http://test.com' }] },
      tools: [
        {
          name: 'getItems',
          _meta: { method: 'get', path: '/items', baseUrl: 'http://test.com' },
        },
      ],
      resolvedBaseUrl: 'http://test.com',
      normalizedInputUrl: 'http://test.com/openapi.json',
    });

    const client = new McpClient({
      id: 'test',
      name: 'test',
      url: 'http://test.com/openapi.json',
      enabled: true,
      token: 'my-secret-token',
      headers: { Authorization: 'Custom my-api-key' },
      tools: [],
      allowedTools: [],
    });
    await client.connect();

    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ items: [] }),
      text: async () => '',
    });

    await client.callTool('getItems', {});

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test.com/items',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Custom my-api-key',
        }),
      })
    );

    mockFetch.mockReset();
  });

  it('treats token-derived Authorization as satisfying required security headers', async () => {
    (validateOpenApiEndpoint as jest.Mock).mockResolvedValue({
      ok: true,
      spec: { info: { title: 'Test API' }, servers: [{ url: 'http://test.com' }] },
      tools: [
        {
          name: 'secureTool',
          _meta: {
            method: 'get',
            path: '/secure',
            baseUrl: 'http://test.com',
            securityHeaders: ['Authorization'],
          },
        },
      ],
      resolvedBaseUrl: 'http://test.com',
      normalizedInputUrl: 'http://test.com/openapi.json',
    });

    const client = new McpClient({
      id: 'test',
      name: 'test',
      url: 'http://test.com/openapi.json',
      enabled: true,
      token: 'my-secret-token',
      tools: [],
      allowedTools: [],
    });
    await client.connect();

    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true }),
      text: async () => '',
    });

    await expect(client.callTool('secureTool', {})).resolves.toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test.com/secure',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-secret-token',
        }),
      })
    );

    mockFetch.mockReset();
  });
});
