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
    const schema = tools[0].inputSchema;
    
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
});
