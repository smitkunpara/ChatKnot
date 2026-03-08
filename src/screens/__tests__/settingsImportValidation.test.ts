import { validateImportPayload } from '../../utils/settingsValidation';

describe('validateImportPayload', () => {
    it('returns null for a valid payload with providers and mcpServers', () => {
        const payload = {
            providers: [
                { id: 'p1', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test' },
            ],
            mcpServers: [
                { id: 's1', name: 'My Server', url: 'https://api.example.com' },
            ],
        };
        expect(validateImportPayload(payload)).toBeNull();
    });

    it('returns null for a payload with only providers', () => {
        const payload = {
            providers: [
                { id: 'p1', name: 'Test', baseUrl: 'https://example.com' },
            ],
        };
        expect(validateImportPayload(payload)).toBeNull();
    });

    it('returns null for a payload with no providers or servers', () => {
        expect(validateImportPayload({ systemPrompt: 'Hello' })).toBeNull();
    });

    it('returns error for null payload', () => {
        expect(validateImportPayload(null)).toBe('Import payload is empty or not an object.');
    });

    it('returns error for undefined payload', () => {
        expect(validateImportPayload(undefined)).toBe('Import payload is empty or not an object.');
    });

    it('returns error for non-object payload', () => {
        expect(validateImportPayload('string')).toBe('Import payload is empty or not an object.');
    });

    it('returns error when providers is not an array', () => {
        expect(validateImportPayload({ providers: 'not-array' })).toBe('"providers" must be an array.');
    });

    it('returns error for provider without id', () => {
        const payload = {
            providers: [{ name: 'Test', baseUrl: 'https://example.com' }],
        };
        expect(validateImportPayload(payload)).toMatch(/missing a valid "id"/);
    });

    it('returns error for provider with empty id', () => {
        const payload = {
            providers: [{ id: '  ', name: 'Test', baseUrl: 'https://example.com' }],
        };
        expect(validateImportPayload(payload)).toMatch(/missing a valid "id"/);
    });

    it('returns error for provider without name', () => {
        const payload = {
            providers: [{ id: 'p1', baseUrl: 'https://example.com' }],
        };
        expect(validateImportPayload(payload)).toMatch(/missing a valid "name"/);
    });

    it('returns error for provider without baseUrl', () => {
        const payload = {
            providers: [{ id: 'p1', name: 'Test' }],
        };
        expect(validateImportPayload(payload)).toMatch(/missing a valid "baseUrl"/);
    });

    it('returns error for provider with empty baseUrl', () => {
        const payload = {
            providers: [{ id: 'p1', name: 'Test', baseUrl: '' }],
        };
        expect(validateImportPayload(payload)).toMatch(/missing a valid "baseUrl"/);
    });

    it('returns error for provider that is not an object', () => {
        const payload = { providers: ['not-an-object'] };
        expect(validateImportPayload(payload)).toMatch(/not a valid object/);
    });

    it('returns error when mcpServers is not an array', () => {
        expect(validateImportPayload({ mcpServers: {} })).toBe('"mcpServers" must be an array.');
    });

    it('returns error for MCP server without id', () => {
        const payload = {
            mcpServers: [{ name: 'Server', url: 'https://example.com' }],
        };
        expect(validateImportPayload(payload)).toMatch(/missing a valid "id"/);
    });

    it('returns error for MCP server without name', () => {
        const payload = {
            mcpServers: [{ id: 's1', url: 'https://example.com' }],
        };
        expect(validateImportPayload(payload)).toMatch(/missing a valid "name"/);
    });

    it('returns error for MCP server without url', () => {
        const payload = {
            mcpServers: [{ id: 's1', name: 'Server' }],
        };
        expect(validateImportPayload(payload)).toMatch(/missing a valid "url"/);
    });

    it('returns error for MCP server with empty url', () => {
        const payload = {
            mcpServers: [{ id: 's1', name: 'Server', url: '   ' }],
        };
        expect(validateImportPayload(payload)).toMatch(/missing a valid "url"/);
    });

    it('returns error for MCP server that is not an object', () => {
        const payload = { mcpServers: [null] };
        expect(validateImportPayload(payload)).toMatch(/not a valid object/);
    });

    it('validates multiple providers and reports first error', () => {
        const payload = {
            providers: [
                { id: 'p1', name: 'Good', baseUrl: 'https://example.com' },
                { id: 'p2', name: 'Bad' }, // missing baseUrl
            ],
        };
        const error = validateImportPayload(payload);
        expect(error).toMatch(/Bad.*missing a valid "baseUrl"/);
    });

    describe('modes validation', () => {
        it('returns null for payload with valid modes', () => {
            const payload = {
                providers: [],
                modes: [
                    { id: 'm1', name: 'Default', systemPrompt: 'Hi', providerId: null, model: null, mcpServers: [], isDefault: true },
                ],
                lastUsedModeId: 'm1',
            };
            expect(validateImportPayload(payload)).toBeNull();
        });

        it('returns error when modes is not an array', () => {
            expect(validateImportPayload({ modes: 'not-array' })).toBe('"modes" must be an array.');
        });

        it('returns error for mode without id', () => {
            const payload = {
                modes: [{ name: 'Test', systemPrompt: 'Hi', mcpServers: [] }],
            };
            expect(validateImportPayload(payload)).toMatch(/missing a valid "id"/);
        });

        it('returns error for mode without name', () => {
            const payload = {
                modes: [{ id: 'm1', systemPrompt: 'Hi', mcpServers: [] }],
            };
            expect(validateImportPayload(payload)).toMatch(/missing a valid "name"/);
        });

        it('returns error for mode with name exceeding max length', () => {
            const payload = {
                modes: [{ id: 'm1', name: 'A'.repeat(25), systemPrompt: 'Hi', mcpServers: [] }],
            };
            expect(validateImportPayload(payload)).toMatch(/exceeds the maximum length/);
        });

        it('returns error for mode without systemPrompt', () => {
            const payload = {
                modes: [{ id: 'm1', name: 'Test', mcpServers: [] }],
            };
            expect(validateImportPayload(payload)).toMatch(/missing a valid "systemPrompt"/);
        });

        it('returns error for invalid mcpServer inside a mode', () => {
            const payload = {
                modes: [{
                    id: 'm1', name: 'Test', systemPrompt: 'Hi',
                    mcpServers: [{ id: 's1', name: 'S', url: '' }],
                }],
            };
            expect(validateImportPayload(payload)).toMatch(/missing a valid "url"/);
        });

        it('returns null for mode with valid mcpServers', () => {
            const payload = {
                modes: [{
                    id: 'm1', name: 'Test', systemPrompt: 'Hi',
                    mcpServers: [{ id: 's1', name: 'S', url: 'https://s.test' }],
                }],
            };
            expect(validateImportPayload(payload)).toBeNull();
        });

        it('returns null for mode without mcpServers (optional)', () => {
            const payload = {
                modes: [{ id: 'm1', name: 'Test', systemPrompt: 'Hi' }],
            };
            expect(validateImportPayload(payload)).toBeNull();
        });

        it('returns null for mode with valid mcpServerOverrides', () => {
            const payload = {
                modes: [{
                    id: 'm1', name: 'Test', systemPrompt: 'Hi',
                    mcpServerOverrides: { s1: { enabled: true } },
                }],
            };
            expect(validateImportPayload(payload)).toBeNull();
        });

        it('returns error for mode with invalid mcpServerOverrides (array)', () => {
            const payload = {
                modes: [{
                    id: 'm1', name: 'Test', systemPrompt: 'Hi',
                    mcpServerOverrides: [{ enabled: true }],
                }],
            };
            expect(validateImportPayload(payload)).toMatch(/invalid "mcpServerOverrides"/);
        });
    });
});
