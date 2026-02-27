import {
  formatOpenApiValidationError,
  validateOpenApiEndpoint,
} from '../OpenApiValidationService';

type MockResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<any>;
};

const makeJsonResponse = (status: number, payload: unknown): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 404 ? 'Not Found' : 'OK',
  json: async () => payload,
});

const makeMalformedJsonResponse = (status = 200): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: 'OK',
  json: async () => {
    throw new SyntaxError('Unexpected token < in JSON at position 0');
  },
});

const validSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Demo API',
    version: '1.0.0',
  },
  paths: {
    '/health': {
      get: {
        operationId: 'healthCheck',
      },
    },
  },
};

describe('OpenApiValidationService', () => {
  it('validates a base URL via <base>/openapi.json', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      if (url === 'https://demo.example.com/openapi.json') {
        return makeJsonResponse(200, validSpec);
      }
      return makeJsonResponse(404, { error: 'missing' });
    });

    const result = await validateOpenApiEndpoint({
      url: 'https://demo.example.com',
      fetchImpl: fetchImpl as any,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected validation success');
    }

    expect(result.resolvedSpecUrl).toBe('https://demo.example.com/openapi.json');
    expect(result.tools).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falls back to direct URL when base probe fails and URL is spec-like', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      if (url === 'https://demo.example.com/openapi.json/openapi.json') {
        return makeJsonResponse(404, { error: 'not found' });
      }
      if (url === 'https://demo.example.com/openapi.json') {
        return makeJsonResponse(200, validSpec);
      }
      return makeJsonResponse(500, { error: 'unexpected' });
    });

    const result = await validateOpenApiEndpoint({
      url: 'https://demo.example.com/openapi.json',
      fetchImpl: fetchImpl as any,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected validation success');
    }

    expect(result.resolvedSpecUrl).toBe('https://demo.example.com/openapi.json');
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://demo.example.com/openapi.json/openapi.json',
      expect.any(Object)
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://demo.example.com/openapi.json',
      expect.any(Object)
    );
  });

  it('returns typed spec error for malformed JSON payload', async () => {
    const fetchImpl = jest.fn(async () => makeMalformedJsonResponse());

    const result = await validateOpenApiEndpoint({
      url: 'https://demo.example.com',
      fetchImpl: fetchImpl as any,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected validation failure');
    }

    expect(result.error.code).toBe('INVALID_JSON');
    expect(result.error.field).toBe('spec');
    expect(formatOpenApiValidationError(result.error)).toContain('OpenAPI spec');
  });

  it('returns typed spec error when required fields are missing', async () => {
    const fetchImpl = jest.fn(async () =>
      makeJsonResponse(200, {
        openapi: '3.1.0',
        info: {
          version: '1.0.0',
        },
        paths: {
          '/health': {
            get: {
              operationId: 'healthCheck',
            },
          },
        },
      })
    );

    const result = await validateOpenApiEndpoint({
      url: 'https://demo.example.com',
      fetchImpl: fetchImpl as any,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected validation failure');
    }

    expect(result.error.code).toBe('INVALID_SPEC');
    expect(result.error.field).toBe('spec');
    expect(result.error.message).toContain('info.title');
  });

  it('returns typed error when no callable operations are available', async () => {
    const fetchImpl = jest.fn(async () =>
      makeJsonResponse(200, {
        openapi: '3.1.0',
        info: {
          title: 'No Ops API',
          version: '1.0.0',
        },
        paths: {
          '/trace-only': {
            trace: {
              operationId: 'traceCall',
            },
          },
        },
      })
    );

    const result = await validateOpenApiEndpoint({
      url: 'https://demo.example.com',
      fetchImpl: fetchImpl as any,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected validation failure');
    }

    expect(result.error.code).toBe('NO_OPERATIONS');
    expect(result.error.field).toBe('spec');
  });
});
