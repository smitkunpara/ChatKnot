import { extractOpenApiTools } from '../OpenApiValidationService';

describe('OpenApiToolExtraction', () => {
  it('sanitizes tool names to satisfy OpenAI requirement ^[a-zA-Z0-9_-]+$', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/user/{user_id}/profile': {
          get: {
            operationId: 'get-user.profile{id}',
            parameters: [
              { name: 'user_id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: { 200: { description: 'ok' } }
          }
        }
      }
    };

    const tools = extractOpenApiTools(spec);
    expect(tools).toHaveLength(1);
    // 'get-user.profile{id}' -> 'get_user_profile_id' (trailing underscore from '{id}' is stripped)
    expect(tools[0].name).toBe('get_user_profile_id');
    expect(tools[0].name).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('ensures inputSchema always has type: "object" and merges parameters/body', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/update': {
          post: {
            operationId: 'updateUser',
            parameters: [
              { name: 'apiKey', in: 'query', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['email'],
                    properties: {
                      email: { type: 'string' },
                      name: { type: 'string' }
                    }
                  }
                }
              }
            },
            responses: { 200: { description: 'ok' } }
          }
        }
      }
    };

    const tools = extractOpenApiTools(spec);
    expect(tools).toHaveLength(1);
    const schema = tools[0].inputSchema;
    
    expect(schema.type).toBe('object');
    expect(schema.properties).toHaveProperty('apiKey');
    expect(schema.properties).toHaveProperty('email');
    expect(schema.properties).toHaveProperty('name');
    expect(schema.required).toContain('apiKey');
    expect(schema.required).toContain('email');
  });

  it('handles non-object requestBody by wrapping it in a "body" property', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/upload': {
          post: {
            operationId: 'uploadRaw',
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'array', items: { type: 'string' } }
                }
              }
            },
            responses: { 200: { description: 'ok' } }
          }
        }
      }
    };

    const tools = extractOpenApiTools(spec);
    const schema = tools[0].inputSchema as any;
    
    expect(schema.type).toBe('object');
    expect(schema.properties.body).toEqual({ type: 'array', items: { type: 'string' } });
  });

  it('removes empty required array to satisfy strict JSON Schema parsers', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/status': {
          get: {
            operationId: 'getStatus',
            responses: { 200: { description: 'ok' } }
          }
        }
      }
    };

    const tools = extractOpenApiTools(spec);
    expect(tools[0].inputSchema).not.toHaveProperty('required');
    expect(tools[0].inputSchema.type).toBe('object');
  });

  it('extracts multiple operations across different paths', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          get: {
            operationId: 'listUsers',
            responses: { 200: { description: 'ok' } }
          },
          post: {
            operationId: 'createUser',
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { name: { type: 'string' } } }
                }
              }
            },
            responses: { 201: { description: 'created' } }
          }
        },
        '/users/{id}': {
          get: {
            operationId: 'getUser',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { 200: { description: 'ok' } }
          },
          delete: {
            operationId: 'deleteUser',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { 204: { description: 'no content' } }
          }
        }
      }
    };

    const tools = extractOpenApiTools(spec);
    expect(tools).toHaveLength(4);
    const toolNames = tools.map(t => t.name).sort();
    expect(toolNames).toEqual(['createUser', 'deleteUser', 'getUser', 'listUsers']);
  });

  it('skips non-callable HTTP methods (trace, options, head)', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/health': {
          get: { operationId: 'healthCheck', responses: { 200: { description: 'ok' } } },
          post: { operationId: 'ping', responses: { 200: { description: 'ok' } } },
          trace: { operationId: 'traceCall', responses: { 200: { description: 'ok' } } },
          options: { operationId: 'optionsCall', responses: { 200: { description: 'ok' } } },
          head: { operationId: 'headCall', responses: { 200: { description: 'ok' } } },
        }
      }
    };

    const tools = extractOpenApiTools(spec);
    expect(tools).toHaveLength(2);
    expect(tools.map(t => t.name)).toEqual(['healthCheck', 'ping']);
  });

  it('handles operations without operationId by generating a name from path and method', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/health': {
          get: {
            responses: { 200: { description: 'ok' } }
          }
        }
      }
    };

    const tools = extractOpenApiTools(spec);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
});
