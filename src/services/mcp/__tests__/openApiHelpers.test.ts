import {
  ensureHttpUrl,
  extractSecuritySchemeNames,
  extractSecurityHeaders,
  sanitizeToolName,
  hasHeaderCaseInsensitive,
  buildAuthHeaders,
  resolveToolBaseUrl,
} from '../openApiHelpers';

describe('openApiHelpers', () => {
  describe('ensureHttpUrl', () => {
    it('returns empty string for empty input', () => {
      expect(ensureHttpUrl('')).toBe('');
      expect(ensureHttpUrl('   ')).toBe('');
    });

    it('prepends https:// when no protocol is present', () => {
      expect(ensureHttpUrl('example.com')).toBe('https://example.com');
      expect(ensureHttpUrl('api.example.com/v1')).toBe('https://api.example.com/v1');
    });

    it('preserves existing http:// or https:// protocol', () => {
      expect(ensureHttpUrl('http://example.com')).toBe('http://example.com');
      expect(ensureHttpUrl('https://example.com')).toBe('https://example.com');
      expect(ensureHttpUrl('HTTP://EXAMPLE.COM')).toBe('HTTP://EXAMPLE.COM');
    });

    it('trims whitespace before checking protocol', () => {
      expect(ensureHttpUrl('  http://example.com  ')).toBe('http://example.com');
      expect(ensureHttpUrl('  example.com  ')).toBe('https://example.com');
    });
  });

  describe('extractSecuritySchemeNames', () => {
    it('returns empty array for non-array input', () => {
      expect(extractSecuritySchemeNames(null)).toEqual([]);
      expect(extractSecuritySchemeNames(undefined)).toEqual([]);
      expect(extractSecuritySchemeNames('string')).toEqual([]);
      expect(extractSecuritySchemeNames({})).toEqual([]);
    });

    it('extracts unique scheme names from security array', () => {
      const security = [{ apiKey: [] }, { bearerAuth: [] }, { apiKey: [] }];
      expect(extractSecuritySchemeNames(security)).toEqual(['apiKey', 'bearerAuth']);
    });

    it('skips invalid entries', () => {
      const security = [null, { valid: [] }, 'invalid', 42, { another: [] }];
      expect(extractSecuritySchemeNames(security)).toEqual(['valid', 'another']);
    });
  });

  describe('extractSecurityHeaders', () => {
    it('returns empty array when no matching header schemes', () => {
      const spec = {
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer' },
          },
        },
      };
      expect(extractSecurityHeaders(spec, ['bearerAuth'])).toEqual([]);
    });

    it('extracts header names for apiKey-in-header schemes', () => {
      const spec = {
        components: {
          securitySchemes: {
            apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
            bearerAuth: { type: 'http', scheme: 'bearer' },
          },
        },
      };
      expect(extractSecurityHeaders(spec, ['apiKey', 'bearerAuth'])).toEqual(['X-API-Key']);
    });

    it('handles missing components gracefully', () => {
      expect(extractSecurityHeaders({}, ['apiKey'])).toEqual([]);
      expect(extractSecurityHeaders({ components: {} }, ['apiKey'])).toEqual([]);
    });

    it('deduplicates header names', () => {
      const spec = {
        components: {
          securitySchemes: {
            key1: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
            key2: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
          },
        },
      };
      expect(extractSecurityHeaders(spec, ['key1', 'key2'])).toEqual(['X-API-Key']);
    });
  });

  describe('sanitizeToolName', () => {
    it('replaces invalid characters with underscores', () => {
      expect(sanitizeToolName('get-user.profile')).toBe('get_user_profile');
      expect(sanitizeToolName('my tool name!')).toBe('my_tool_name');
    });

    it('strips leading and trailing underscores', () => {
      expect(sanitizeToolName('_tool_')).toBe('tool');
      expect(sanitizeToolName('___name___')).toBe('name');
    });

    it('returns "tool" for empty or all-invalid input', () => {
      expect(sanitizeToolName('')).toBe('tool');
      expect(sanitizeToolName('...')).toBe('tool');
      expect(sanitizeToolName('---')).toBe('tool');
    });

    it('preserves valid characters', () => {
      expect(sanitizeToolName('myTool_v2')).toBe('myTool_v2');
    });
  });

  describe('hasHeaderCaseInsensitive', () => {
    it('finds header regardless of case', () => {
      const headers = { Authorization: 'Bearer token', 'X-Custom': 'value' };
      expect(hasHeaderCaseInsensitive(headers, 'authorization')).toBe(true);
      expect(hasHeaderCaseInsensitive(headers, 'AUTHORIZATION')).toBe(true);
      expect(hasHeaderCaseInsensitive(headers, 'x-custom')).toBe(true);
      expect(hasHeaderCaseInsensitive(headers, 'X-CUSTOM')).toBe(true);
    });

    it('returns false for missing headers', () => {
      const headers = { Authorization: 'Bearer token' };
      expect(hasHeaderCaseInsensitive(headers, 'X-Missing')).toBe(false);
    });

    it('returns false for empty-value headers', () => {
      const headers = { Authorization: '' };
      expect(hasHeaderCaseInsensitive(headers, 'authorization')).toBe(false);
    });
  });

  describe('buildAuthHeaders', () => {
    it('returns existing headers when no token', () => {
      const headers = { 'X-Custom': 'value' };
      expect(buildAuthHeaders(headers, '')).toEqual({ 'X-Custom': 'value' });
      expect(buildAuthHeaders(headers)).toEqual({ 'X-Custom': 'value' });
    });

    it('adds Bearer token when Authorization is missing', () => {
      expect(buildAuthHeaders({ 'X-Custom': 'value' }, 'my-token')).toEqual({
        'X-Custom': 'value',
        Authorization: 'Bearer my-token',
      });
    });

    it('does not override existing Authorization header', () => {
      const headers = { Authorization: 'Custom existing' };
      expect(buildAuthHeaders(headers, 'my-token')).toEqual({
        Authorization: 'Custom existing',
      });
    });

    it('handles case-insensitive existing Authorization', () => {
      const headers = { authorization: 'existing' };
      expect(buildAuthHeaders(headers, 'my-token')).toEqual({
        authorization: 'existing',
      });
    });
  });

  describe('resolveToolBaseUrl', () => {
    it('returns fallback when serverUrl is empty', () => {
      expect(resolveToolBaseUrl(undefined, 'http://fallback.com')).toBe('http://fallback.com');
      expect(resolveToolBaseUrl('', 'http://fallback.com')).toBe('http://fallback.com');
      expect(resolveToolBaseUrl('   ', 'http://fallback.com')).toBe('http://fallback.com');
    });

    it('returns absolute URLs as-is', () => {
      expect(resolveToolBaseUrl('https://api.example.com', 'http://fallback.com')).toBe('https://api.example.com');
    });

    it('resolves relative paths against fallback', () => {
      expect(resolveToolBaseUrl('/api/v2', 'http://example.com/base')).toBe('http://example.com/api/v2');
    });

    it('prepends https:// for bare hostnames', () => {
      expect(resolveToolBaseUrl('api.example.com', 'http://fallback.com')).toBe('https://api.example.com');
    });
  });
});
