import { Mode } from '../types';

/**
 * Derive the active mode from available modes, last-used preference,
 * and an optional conversation-level mode override.
 *
 * Resolution order:
 *   1. conversationModeId (per-conversation override)
 *   2. lastUsedModeId (global preference)
 *   3. first mode in array (fallback)
 *   4. null (no modes exist)
 */
export const getActiveMode = (
  modes: Mode[],
  lastUsedModeId: string | null,
  conversationModeId?: string | null,
): Mode | null => {
  if (conversationModeId) {
    const convMode = modes.find(m => m.id === conversationModeId);
    if (convMode) return convMode;
  }

  if (lastUsedModeId) {
    const lastUsed = modes.find(m => m.id === lastUsedModeId);
    if (lastUsed) return lastUsed;
  }

  return modes[0] ?? null;
};
