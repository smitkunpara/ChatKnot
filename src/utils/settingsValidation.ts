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
        }
    }

    if (settings.mcpServers !== undefined) {
        if (!Array.isArray(settings.mcpServers)) {
            return '"mcpServers" must be an array.';
        }
        for (let i = 0; i < settings.mcpServers.length; i++) {
            const s = settings.mcpServers[i];
            if (!s || typeof s !== 'object') {
                return `MCP server at index ${i} is not a valid object.`;
            }
            if (typeof s.id !== 'string' || !s.id.trim()) {
                return `MCP server at index ${i} is missing a valid "id".`;
            }
            if (typeof s.name !== 'string' || !s.name.trim()) {
                return `MCP server at index ${i} is missing a valid "name".`;
            }
            if (typeof s.url !== 'string' || !s.url.trim()) {
                return `MCP server "${s.name || i}" is missing a valid "url".`;
            }
        }
    }

    return null;
};
