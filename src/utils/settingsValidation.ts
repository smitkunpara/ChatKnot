import { MAX_MODE_NAME_LENGTH } from '../constants/storage';

const isValidUrl = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

const validateMcpServerArray = (mcpServers: any[], label: string): string | null => {
    for (let i = 0; i < mcpServers.length; i++) {
        const s = mcpServers[i];
        if (!s || typeof s !== 'object') {
            return `${label} MCP server at index ${i} is not a valid object.`;
        }
        if (typeof s.id !== 'string' || !s.id.trim()) {
            return `${label} MCP server at index ${i} is missing a valid "id".`;
        }
        if (typeof s.name !== 'string' || !s.name.trim()) {
            return `${label} MCP server at index ${i} is missing a valid "name".`;
        }
        if (typeof s.url !== 'string' || !s.url.trim()) {
            return `${label} MCP server "${s.name || i}" is missing a valid "url".`;
        }
        if (!isValidUrl(s.url)) {
            return `${label} MCP server "${s.name || i}" has an invalid URL format.`;
        }
    }
    return null;
};

/**
 * Validates the shape of an imported settings payload.
 * Returns an error message string if invalid, or null if valid.
 */
export const validateImportPayload = (settings: any): string | null => {
    if (!settings || typeof settings !== 'object') {
        return 'Import payload is empty or not an object.';
    }

    if (settings.providers !== undefined) {
        if (!Array.isArray(settings.providers)) {
            return '"providers" must be an array.';
        }
        for (let i = 0; i < settings.providers.length; i++) {
            const p = settings.providers[i];
            if (!p || typeof p !== 'object') {
                return `Provider at index ${i} is not a valid object.`;
            }
            if (typeof p.id !== 'string' || !p.id.trim()) {
                return `Provider at index ${i} is missing a valid "id".`;
            }
            if (typeof p.name !== 'string' || !p.name.trim()) {
                return `Provider at index ${i} is missing a valid "name".`;
            }
            if (typeof p.baseUrl !== 'string' || !p.baseUrl.trim()) {
                return `Provider "${p.name || i}" is missing a valid "baseUrl".`;
            }
            if (!isValidUrl(p.baseUrl)) {
                return `Provider "${p.name || i}" has an invalid "baseUrl" format.`;
            }
        }
    }

    // Validate modes array if present
    if (settings.modes !== undefined) {
        if (!Array.isArray(settings.modes)) {
            return '"modes" must be an array.';
        }
        for (let i = 0; i < settings.modes.length; i++) {
            const m = settings.modes[i];
            if (!m || typeof m !== 'object') {
                return `Mode at index ${i} is not a valid object.`;
            }
            if (typeof m.id !== 'string' || !m.id.trim()) {
                return `Mode at index ${i} is missing a valid "id".`;
            }
            if (typeof m.name !== 'string' || !m.name.trim()) {
                return `Mode at index ${i} is missing a valid "name".`;
            }
            if (m.name.length > MAX_MODE_NAME_LENGTH) {
                return `Mode "${m.name}" name exceeds the maximum length of ${MAX_MODE_NAME_LENGTH} characters.`;
            }
            if (typeof m.systemPrompt !== 'string') {
                return `Mode "${m.name}" is missing a valid "systemPrompt".`;
            }
            if (Array.isArray(m.mcpServers)) {
                const serverError = validateMcpServerArray(m.mcpServers, `Mode "${m.name}"`);
                if (serverError) return serverError;
            }
            if (m.mcpServerOverrides !== undefined && (typeof m.mcpServerOverrides !== 'object' || Array.isArray(m.mcpServerOverrides))) {
                return `Mode "${m.name}" has an invalid "mcpServerOverrides" (expected object).`;
            }
        }
    }

    // Legacy mcpServers at top level (backward compat — will be converted to default mode)
    if (settings.mcpServers !== undefined) {
        if (!Array.isArray(settings.mcpServers)) {
            return '"mcpServers" must be an array.';
        }
        const serverError = validateMcpServerArray(settings.mcpServers, '');
        if (serverError) return serverError;
    }

    return null;
};
