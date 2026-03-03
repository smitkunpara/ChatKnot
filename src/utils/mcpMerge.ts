import { McpServerConfig, ModeServerOverride } from '../types';

/**
 * Merge global MCP server configs with per-mode overrides.
 * Each mode can override `enabled` and `autoAllow` for any global server.
 * Servers without an override use their global defaults.
 */
export const mergeServersWithOverrides = (
  globalServers: McpServerConfig[],
  overrides: Record<string, ModeServerOverride>
): McpServerConfig[] =>
  globalServers.map((server) => {
    const override = overrides[server.id];
    if (!override) return server;
    return {
      ...server,
      enabled: override.enabled,
      autoAllow: override.autoAllow,
    };
  });
