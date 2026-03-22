jest.mock('react-native-sse', () => {
  return jest.fn().mockImplementation(() => ({
    addEventListener: jest.fn(),
    close: jest.fn(),
  }));
});
jest.mock('react-native-uuid', () => ({ v4: () => 'test-uuid' }));

import { McpClient } from '../McpClient';
import { validateOpenApiEndpoint } from '../OpenApiValidationService';

jest.mock('../OpenApiValidationService');

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('McpClient OpenAPI execution paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupOpenApiClient = async (tools: any[]) => {
    (validateOpenApiEndpoint as jest.Mock).mockResolvedValue({
      ok: true,
      spec: { info: { title: 'Test API' }, servers: [{ url: 'http://test.com' }] },
      tools,
      resolvedBaseUrl: 'http://test.com',
      normalizedInputUrl: 'http://test.com/openapi.json',
    });

    const client = new McpClient({ id: 'test', name: 'test', url: 'http://test.com/openapi.json', enabled: true, tools: [], allowedTools: [] });
    await client.connect();
    return client;
  };

  it('routes parameters correctly for GET requests (query vs path)', async () => {
    const client = await setupOpenApiClient([
      {
        name: 'getUser',
        _meta: { method: 'get', path: '/users/{id}', baseUrl: 'http://test.com' }
      }
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true })
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
        _meta: { method: 'post', path: '/orgs/{orgId}/users', baseUrl: 'http://test.com' }
      }
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true })
    });

    await client.callTool('createUser', { orgId: 'org1', name: 'Alice', role: 'admin' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test.com/orgs/org1/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Alice', role: 'admin' })
      })
    );
  });

  it('sanitizes large error payloads', async () => {
    const client = await setupOpenApiClient([
      {
        name: 'failingTool',
        _meta: { method: 'get', path: '/fail', baseUrl: 'http://test.com' }
      }
    ]);

    const massiveString = 'A'.repeat(5000);
    const mockErrorData = {
      message: massiveString,
      stack: 'Error at line 1...',
      details: {
        trace: 'Something',
      }
    };

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => JSON.stringify(mockErrorData)
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
        _meta: { method: 'get', path: '/fail', baseUrl: 'http://test.com' }
      }
    ]);

    const massiveString = 'A'.repeat(5000);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => massiveString
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
});
