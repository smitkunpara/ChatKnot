import {
  McpToolSchema,
  OpenApiValidationError,
  OpenApiValidationFailure,
  OpenApiValidationResult,
} from '../../types';
import {
  ensureHttpUrl,
  extractSecuritySchemeNames,
  extractSecurityHeaders,
  sanitizeToolName,
  buildAuthHeaders,
} from './openApiHelpers';

type ValidateOpenApiEndpointInput = {
  url: string;
  headers?: Record<string, string>;
  token?: string;
  fetchImpl?: typeof fetch;
};

const CALLABLE_HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch'];

const toFailure = (error: OpenApiValidationError): OpenApiValidationFailure => ({
  ok: false,
  error,
});

const looksLikeSpecUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return (
      path.endsWith('/openapi.json') ||
      path.endsWith('/openapi.yaml') ||
      path.endsWith('/openapi.yml') ||
      path.endsWith('/swagger.json') ||
      path === '/openapi' ||
      path === '/swagger'
    );
  } catch {
    return false;
  }
};

const toOpenApiProbeUrl = (url: string): string => {
  const parsed = new URL(url);
  const cleanPath = parsed.pathname.replace(/\/$/, '');
  parsed.pathname = `${cleanPath}/openapi.json`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
};

const buildProbeUrls = (normalizedInputUrl: string): string[] => {
  const baseProbeUrl = toOpenApiProbeUrl(normalizedInputUrl);
  if (!looksLikeSpecUrl(normalizedInputUrl) || baseProbeUrl === normalizedInputUrl) {
    return [baseProbeUrl];
  }

  return [baseProbeUrl, normalizedInputUrl];
};

interface OpenApiSchema {
  type?: string;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  $ref?: string;
  [key: string]: unknown;
}

interface OpenApiParameter {
  name?: string;
  required?: boolean;
  schema?: OpenApiSchema;
  in?: string;
  [key: string]: unknown;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: {
      'application/json'?: {
        schema?: OpenApiSchema;
      };
    };
  };
  security?: unknown;
  [key: string]: unknown;
}

interface OpenApiSpec {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, OpenApiOperation>>;
  servers?: Array<{ url?: string }>;
  components?: { schemas?: Record<string, OpenApiSchema>; securitySchemes?: Record<string, unknown> };
  security?: unknown;
  [key: string]: unknown;
}

const resolveSchema = (schema: unknown, components: Record<string, OpenApiSchema>): OpenApiSchema => {
  const s = schema as OpenApiSchema | undefined;
  if (s?.$ref) {
    const refName = s.$ref.split('/').pop();
    if (refName) {
      const resolved = components?.[refName];
      if (resolved) return resolved;
    }
  }
  return (schema || {}) as OpenApiSchema;
};

export const extractOpenApiTools = (spec: unknown): McpToolSchema[] => {
  const tools: McpToolSchema[] = [];
  const specObj = spec as OpenApiSpec;
  const schemas = specObj?.components?.schemas || {};
  const globalSecurity = extractSecuritySchemeNames(specObj?.security);

  Object.entries(specObj?.paths || {}).forEach(([path, methods]) => {
    if (!methods || typeof methods !== 'object') {
      return;
    }

    Object.entries(methods).forEach(([method, operation]) => {
      if (!CALLABLE_HTTP_METHODS.includes(method.toLowerCase())) {
        return;
      }
      if (!operation || typeof operation !== 'object') {
        return;
      }

      const rawName = operation.operationId || `${method}_${path.replace(/\//g, '_')}`;
      const name = sanitizeToolName(rawName);

      const inputSchema: OpenApiSchema = { type: 'object', properties: {}, required: [] };

      if (operation.requestBody?.content?.['application/json']?.schema) {
        const bodySchema = resolveSchema(
          operation.requestBody.content['application/json'].schema,
          schemas
        );
        if (bodySchema && typeof bodySchema === 'object') {
          if (bodySchema.type === 'object' || bodySchema.properties) {
            inputSchema.properties = {
              ...inputSchema.properties,
              ...(bodySchema.properties || {}),
            };
            if (Array.isArray(bodySchema.required)) {
              inputSchema.required = Array.from(
                new Set([...(inputSchema.required || []), ...bodySchema.required])
              );
            }
          } else {
            if (!inputSchema.properties) inputSchema.properties = {};
            inputSchema.properties.body = bodySchema;
          }
        }
      }

      if (Array.isArray(operation.parameters)) {
        operation.parameters.forEach((param) => {
          if (!param?.name) return;
          const paramSchema = resolveSchema(param.schema, schemas) || { type: 'string' };
          if (!inputSchema.properties) inputSchema.properties = {};
          inputSchema.properties[param.name] = paramSchema;
          if (param.required && inputSchema.required && !inputSchema.required.includes(param.name)) {
            inputSchema.required.push(param.name);
          }
        });
      }

      if (inputSchema.required && inputSchema.required.length === 0) {
        delete inputSchema.required;
      }

      const operationSecurity = extractSecuritySchemeNames(operation?.security);
      const hasOperationSecurity = Array.isArray(operation?.security);
      const appliedSecurity = hasOperationSecurity ? operationSecurity : globalSecurity;
      const securityHeaders = extractSecurityHeaders(spec, appliedSecurity);

      tools.push({
        name,
        description:
          operation.summary || operation.description || `Call ${method.toUpperCase()} ${path}`,
        inputSchema: inputSchema as Record<string, unknown>,
        _meta: { path, method, baseUrl: specObj?.servers?.[0]?.url, securityHeaders },
      });
    });
  });

  return tools;
};

const validateSpecShape = (spec: unknown): OpenApiValidationFailure | null => {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return toFailure({
      code: 'INVALID_SPEC',
      field: 'spec',
      message: 'Spec payload must be a JSON object.',
    });
  }

  const specObj = spec as OpenApiSpec;
  const missingFields: string[] = [];
  const hasVersion = typeof specObj.openapi === 'string' || typeof specObj.swagger === 'string';
  if (!hasVersion) missingFields.push('openapi/swagger version');

  if (!specObj.info || typeof specObj.info !== 'object') {
    missingFields.push('info.title');
    missingFields.push('info.version');
  } else {
    if (!String(specObj.info.title || '').trim()) {
      missingFields.push('info.title');
    }
    if (!String(specObj.info.version || '').trim()) {
      missingFields.push('info.version');
    }
  }

  if (
    !specObj.paths ||
    typeof specObj.paths !== 'object' ||
    Object.keys(specObj.paths).length === 0
  ) {
    missingFields.push('paths');
  }

  if (missingFields.length > 0) {
    return toFailure({
      code: 'INVALID_SPEC',
      field: 'spec',
      message: `Missing required OpenAPI field(s): ${missingFields.join(', ')}`,
      details: {
        missingFields,
      },
    });
  }

  return null;
};

const resolveSpecToolBaseUrl = (
  normalizedInputUrl: string,
  resolvedSpecUrl: string,
  spec: unknown
): string => {
  const specObj = spec as OpenApiSpec;
  const serverUrl = String(specObj?.servers?.[0]?.url || '').trim();

  if (serverUrl) {
    if (/^https?:\/\//i.test(serverUrl)) {
      return serverUrl;
    }

    if (serverUrl.startsWith('/')) {
      const root = new URL(resolvedSpecUrl);
      return `${root.protocol}//${root.host}${serverUrl}`;
    }

    return ensureHttpUrl(serverUrl);
  }

  const parsedSpecUrl = new URL(resolvedSpecUrl);
  const lowerPath = parsedSpecUrl.pathname.toLowerCase();
  if (lowerPath.endsWith('/openapi.json')) {
    parsedSpecUrl.pathname =
      parsedSpecUrl.pathname.slice(0, -'/openapi.json'.length) || '/';
    parsedSpecUrl.search = '';
    parsedSpecUrl.hash = '';
    return parsedSpecUrl.toString().replace(/\/$/, '');
  }

  return normalizedInputUrl.replace(/\/$/, '');
};

export const validateOpenApiEndpoint = async (
  input: ValidateOpenApiEndpointInput
): Promise<OpenApiValidationResult> => {
  const normalizedInputUrl = ensureHttpUrl(input.url);
  if (!normalizedInputUrl) {
    return toFailure({
      code: 'URL_REQUIRED',
      field: 'url',
      message: 'Please provide an MCP server URL.',
    });
  }

  try {
    new URL(normalizedInputUrl);
  } catch {
    return toFailure({
      code: 'URL_INVALID',
      field: 'url',
      message: 'Please provide a valid HTTP(S) URL.',
    });
  }

  const headers = buildAuthHeaders(input.headers, input.token);
  const fetchImpl = input.fetchImpl || fetch;
  const probeUrls = buildProbeUrls(normalizedInputUrl);
  const attemptedUrls: string[] = [];
  let lastFailure: OpenApiValidationFailure | null = null;

  for (let i = 0; i < probeUrls.length; i += 1) {
    const probeUrl = probeUrls[i];
    attemptedUrls.push(probeUrl);

    let response: Response | undefined;
    try {
      response = await fetchImpl(probeUrl, { headers });
    } catch {
      lastFailure = toFailure({
        code: 'FETCH_FAILED',
        field: 'network',
        message:
          'Unable to reach the server. Check URL, network connectivity, and SSL setup.',
      });
      continue;
    }

    if (!response?.ok) {
      const status = Number(response?.status || 0);
      const statusText = String(response?.statusText || '').trim();
      lastFailure = toFailure({
        code: 'HTTP_STATUS',
        field: status === 401 || status === 403 ? 'headers' : 'url',
        message: `Endpoint returned HTTP ${status}${statusText ? ` (${statusText})` : ''}.`,
        details: {
          status,
          statusText,
        },
      });
      continue;
    }

    let spec: unknown;
    try {
      spec = await (response as Response).json();
    } catch {
      lastFailure = toFailure({
        code: 'INVALID_JSON',
        field: 'spec',
        message: 'OpenAPI spec response is not valid JSON.',
      });
      continue;
    }

    const shapeFailure = validateSpecShape(spec);
    if (shapeFailure) {
      lastFailure = shapeFailure;
      continue;
    }

    const tools = extractOpenApiTools(spec);
    if (tools.length === 0) {
      lastFailure = toFailure({
        code: 'NO_OPERATIONS',
        field: 'spec',
        message:
          'OpenAPI spec has no callable operations (GET/POST/PUT/PATCH/DELETE).',
      });
      continue;
    }

    return {
      ok: true,
      normalizedInputUrl,
      resolvedSpecUrl: probeUrl,
      resolvedBaseUrl: resolveSpecToolBaseUrl(normalizedInputUrl, probeUrl, spec),
      spec: spec as Record<string, unknown>,
      tools,
    };
  }

  if (lastFailure) {
    return {
      ok: false,
      error: {
        ...lastFailure.error,
        details: {
          ...(lastFailure.error.details || {}),
          attemptedUrls,
        },
      },
    };
  }

  return toFailure({
    code: 'FETCH_FAILED',
    field: 'network',
    message: 'Unable to validate MCP endpoint.',
    details: {
      attemptedUrls,
    },
  });
};

export const formatOpenApiValidationError = (error: OpenApiValidationError): string => {
  const prefix =
    error.field === 'headers'
      ? 'Headers'
      : error.field === 'spec'
        ? 'OpenAPI spec'
        : error.field === 'network'
          ? 'Network'
          : 'Server URL';

  return `${prefix}: ${error.message}`;
};
