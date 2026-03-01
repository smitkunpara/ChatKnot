import {
  McpToolSchema,
  OpenApiValidationError,
  OpenApiValidationFailure,
  OpenApiValidationResult,
} from '../../types';
import { OpenApiToolMeta, ensureHttpUrl, extractSecuritySchemeNames, extractSecurityHeaders } from './openApiHelpers';

type ValidateOpenApiEndpointInput = {
  url: string;
  headers?: Record<string, string>;
  token?: string;
  fetchImpl?: typeof fetch;
};

const CALLABLE_HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch'];

const hasHeader = (headers: Record<string, string>, headerName: string): boolean => {
  const target = headerName.toLowerCase();
  return Object.keys(headers).some((name) => name.toLowerCase() === target);
};

const buildValidationHeaders = (
  headers?: Record<string, string>,
  token?: string
): Record<string, string> => {
  const mergedHeaders: Record<string, string> = { ...(headers || {}) };
  const trimmedToken = String(token || '').trim();
  if (!trimmedToken) {
    return mergedHeaders;
  }

  if (!hasHeader(mergedHeaders, 'authorization')) {
    mergedHeaders.Authorization = `Bearer ${trimmedToken}`;
  }
  if (!hasHeader(mergedHeaders, 'x-api-key')) {
    mergedHeaders['x-api-key'] = trimmedToken;
  }
  if (!hasHeader(mergedHeaders, 'api-key')) {
    mergedHeaders['api-key'] = trimmedToken;
  }

  return mergedHeaders;
};

const toFailure = (error: OpenApiValidationError): OpenApiValidationFailure => ({
  ok: false,
  error,
});

const looksLikeSpecUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return path.endsWith('.json') || path.includes('openapi');
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

const resolveSchema = (schema: any, components: any): any => {
  if (schema?.$ref) {
    const refName = schema.$ref.split('/').pop();
    return components?.[refName] || { type: 'object' };
  }
  return schema;
};

export const extractOpenApiTools = (spec: any): McpToolSchema[] => {
  const tools: McpToolSchema[] = [];
  const schemas = spec?.components?.schemas || {};
  const globalSecurity = extractSecuritySchemeNames(spec?.security);

  Object.entries(spec?.paths || {}).forEach(([path, methods]: [string, any]) => {
    if (!methods || typeof methods !== 'object') {
      return;
    }

    Object.entries(methods).forEach(([method, operation]: [string, any]) => {
      if (!CALLABLE_HTTP_METHODS.includes(method.toLowerCase())) {
        return;
      }
      if (!operation || typeof operation !== 'object') {
        return;
      }

      const name = operation.operationId || `${method}_${path.replace(/\//g, '_')}`;
      let inputSchema: any = { type: 'object', properties: {}, required: [] };

      if (operation.requestBody?.content?.['application/json']?.schema) {
        inputSchema = resolveSchema(operation.requestBody.content['application/json'].schema, schemas);
        if (!inputSchema.required) inputSchema.required = [];
        if (!inputSchema.properties) inputSchema.properties = {};
      }

      if (Array.isArray(operation.parameters)) {
        operation.parameters.forEach((param: any) => {
          if (!param?.schema) return;
          inputSchema.properties[param.name] = param.schema;
          if (param.required && !inputSchema.required.includes(param.name)) {
            inputSchema.required.push(param.name);
          }
        });
      }

      const operationSecurity = extractSecuritySchemeNames(operation?.security);
      const appliedSecurity = operationSecurity.length > 0 ? operationSecurity : globalSecurity;
      const securityHeaders = extractSecurityHeaders(spec, appliedSecurity);

      tools.push({
        name,
        description: operation.summary || operation.description || `Call ${method.toUpperCase()} ${path}`,
        inputSchema,
        _meta: { path, method, baseUrl: spec?.servers?.[0]?.url, securityHeaders } as OpenApiToolMeta,
      } as any);
    });
  });

  return tools;
};

const validateSpecShape = (spec: any): OpenApiValidationFailure | null => {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return toFailure({
      code: 'INVALID_SPEC',
      field: 'spec',
      message: 'Spec payload must be a JSON object.',
    });
  }

  const missingFields: string[] = [];
  const hasVersion = typeof spec.openapi === 'string' || typeof spec.swagger === 'string';
  if (!hasVersion) missingFields.push('openapi/swagger version');

  if (!spec.info || typeof spec.info !== 'object') {
    missingFields.push('info.title');
    missingFields.push('info.version');
  } else {
    if (!String(spec.info.title || '').trim()) {
      missingFields.push('info.title');
    }
    if (!String(spec.info.version || '').trim()) {
      missingFields.push('info.version');
    }
  }

  if (!spec.paths || typeof spec.paths !== 'object' || Object.keys(spec.paths).length === 0) {
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

const resolveToolBaseUrl = (normalizedInputUrl: string, resolvedSpecUrl: string, spec: any): string => {
  const serverUrl = String(spec?.servers?.[0]?.url || '').trim();

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
    parsedSpecUrl.pathname = parsedSpecUrl.pathname.slice(0, -'/openapi.json'.length) || '/';
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

  const headers = buildValidationHeaders(input.headers, input.token);
  const fetchImpl = input.fetchImpl || fetch;
  const probeUrls = buildProbeUrls(normalizedInputUrl);
  const attemptedUrls: string[] = [];
  let lastFailure: OpenApiValidationFailure | null = null;

  for (let i = 0; i < probeUrls.length; i += 1) {
    const probeUrl = probeUrls[i];
    attemptedUrls.push(probeUrl);

    let response: any;
    try {
      response = await fetchImpl(probeUrl, { headers });
    } catch {
      lastFailure = toFailure({
        code: 'FETCH_FAILED',
        field: 'network',
        message: 'Unable to reach the server. Check URL, network connectivity, and SSL setup.',
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

    let spec: any;
    try {
      spec = await response.json();
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
        message: 'OpenAPI spec has no callable operations (GET/POST/PUT/PATCH/DELETE).',
      });
      continue;
    }

    return {
      ok: true,
      normalizedInputUrl,
      resolvedSpecUrl: probeUrl,
      resolvedBaseUrl: resolveToolBaseUrl(normalizedInputUrl, probeUrl, spec),
      spec,
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
