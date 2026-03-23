import { MAX_MODE_NAME_LENGTH } from '../constants/storage';

const isValidUrl = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

const validateMcpServerArray = (mcpServers: unknown[], label: string): string | null => {
    for (let i = 0; i < mcpServers.length; i++) {
        const s = mcpServers[i] as Record<string, unknown> | undefined;
        if (!s || typeof s !== 'object') {
            return `${label} MCP server at index ${i} is not a valid object.`;
        }
        const id = s.id;
        if (typeof id !== 'string' || !id.trim()) {
            return `${label} MCP server at index ${i} is missing a valid "id".`;
        }
        const name = s.name;
        if (typeof name !== 'string' || !name.trim()) {
            return `${label} MCP server at index ${i} is missing a valid "name".`;
        }
        const url = s.url;
        if (typeof url !== 'string' || !url.trim()) {
            return `${label} MCP server "${name || i}" is missing a valid "url".`;
        }
        if (!isValidUrl(url)) {
            return `${label} MCP server "${name || i}" has an invalid URL format.`;
        }
    }
    return null;
};

const validateModeServerOverrides = (
    modeName: string,
    overrides: Record<string, unknown>
): string | null => {
    for (const [serverId, override] of Object.entries(overrides)) {
        if (!override || typeof override !== 'object' || Array.isArray(override)) {
            return `Mode "${modeName}" has an invalid override for server "${serverId}" (expected object).`;
        }

        const typedOverride = override as Record<string, unknown>;

        if (typedOverride.enabled !== undefined && typeof typedOverride.enabled !== 'boolean') {
            return `Mode "${modeName}" override for server "${serverId}" has invalid "enabled" (expected boolean).`;
        }

        if (typedOverride.allowedTools !== undefined && !Array.isArray(typedOverride.allowedTools)) {
            return `Mode "${modeName}" override for server "${serverId}" has invalid "allowedTools" (expected array).`;
        }

        if (typedOverride.autoApprovedTools !== undefined && !Array.isArray(typedOverride.autoApprovedTools)) {
            return `Mode "${modeName}" override for server "${serverId}" has invalid "autoApprovedTools" (expected array).`;
        }
    }

    return null;
};

/**
 * Validates the shape of an imported settings payload.
 * Returns an error message string if invalid, or null if valid.
 */
export const validateImportPayload = (settings: unknown): string | null => {
    if (!settings || typeof settings !== 'object') {
        return 'Import payload is empty or not an object.';
    }

    const s = settings as Record<string, unknown>;

    if (s.providers !== undefined) {
        if (!Array.isArray(s.providers)) {
            return '"providers" must be an array.';
        }
        for (let i = 0; i < s.providers.length; i++) {
            const p = s.providers[i] as Record<string, unknown> | undefined;
            if (!p || typeof p !== 'object') {
                return `Provider at index ${i} is not a valid object.`;
            }
            const pId = p.id;
            if (typeof pId !== 'string' || !pId.trim()) {
                return `Provider at index ${i} is missing a valid "id".`;
            }
            const pName = p.name;
            if (typeof pName !== 'string' || !pName.trim()) {
                return `Provider at index ${i} is missing a valid "name".`;
            }
            const pBaseUrl = p.baseUrl;
            if (typeof pBaseUrl !== 'string' || !pBaseUrl.trim()) {
                return `Provider "${pName || i}" is missing a valid "baseUrl".`;
            }
            if (!isValidUrl(pBaseUrl)) {
                return `Provider "${pName || i}" has an invalid "baseUrl" format.`;
            }
        }
    }

    // Validate modes array if present
    if (s.modes !== undefined) {
        if (!Array.isArray(s.modes)) {
            return '"modes" must be an array.';
        }
        for (let i = 0; i < s.modes.length; i++) {
            const m = s.modes[i] as Record<string, unknown> | undefined;
            if (!m || typeof m !== 'object') {
                return `Mode at index ${i} is not a valid object.`;
            }
            const mId = m.id;
            if (typeof mId !== 'string' || !mId.trim()) {
                return `Mode at index ${i} is missing a valid "id".`;
            }
            const mName = m.name;
            if (typeof mName !== 'string' || !mName.trim()) {
                return `Mode at index ${i} is missing a valid "name".`;
            }
            if (mName.length > MAX_MODE_NAME_LENGTH) {
                return `Mode "${mName}" name exceeds the maximum length of ${MAX_MODE_NAME_LENGTH} characters.`;
            }
            if (typeof m.systemPrompt !== 'string') {
                return `Mode "${mName}" is missing a valid "systemPrompt".`;
            }
            if (Array.isArray(m.mcpServers)) {
                const serverError = validateMcpServerArray(m.mcpServers, `Mode "${mName}"`);
                if (serverError) return serverError;
            }
            if (m.mcpServerOverrides !== undefined && (typeof m.mcpServerOverrides !== 'object' || Array.isArray(m.mcpServerOverrides))) {
                return `Mode "${mName}" has an invalid "mcpServerOverrides" (expected object).`;
            }
            if (m.mcpServerOverrides && typeof m.mcpServerOverrides === 'object' && !Array.isArray(m.mcpServerOverrides)) {
                const overrideError = validateModeServerOverrides(
                    mName,
                    m.mcpServerOverrides as Record<string, unknown>
                );
                if (overrideError) return overrideError;
            }
        }
    }

    // Legacy mcpServers at top level (backward compat — will be converted to default mode)
    if (s.mcpServers !== undefined) {
        if (!Array.isArray(s.mcpServers)) {
            return '"mcpServers" must be an array.';
        }
        const serverError = validateMcpServerArray(s.mcpServers, '');
        if (serverError) return serverError;
    }

    return null;
};
