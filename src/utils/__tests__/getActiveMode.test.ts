import { getActiveMode } from '../getActiveMode';
import { Mode } from '../../types';

const makeMode = (overrides: Partial<Mode> = {}): Mode => ({
  id: overrides.id ?? 'mode-1',
  name: overrides.name ?? 'Default',
  systemPrompt: overrides.systemPrompt ?? '',
  mcpServerOverrides: overrides.mcpServerOverrides ?? {},
  isDefault: overrides.isDefault ?? false,
});

describe('getActiveMode', () => {
  const modes: Mode[] = [
    makeMode({ id: 'a', name: 'Alpha' }),
    makeMode({ id: 'b', name: 'Beta' }),
    makeMode({ id: 'c', name: 'Gamma' }),
  ];

  it('selects mode matching conversationModeId first', () => {
    const result = getActiveMode(modes, 'a', 'c');
    expect(result?.id).toBe('c');
  });

  it('falls back to lastUsedModeId when no conversation override', () => {
    const result = getActiveMode(modes, 'b');
    expect(result?.id).toBe('b');
  });

  it('falls back to lastUsedModeId when conversationModeId is null', () => {
    const result = getActiveMode(modes, 'b', null);
    expect(result?.id).toBe('b');
  });

  it('falls back to first mode when lastUsedModeId does not match', () => {
    const result = getActiveMode(modes, 'nonexistent');
    expect(result?.id).toBe('a');
  });

  it('falls back to first mode when conversationModeId does not match', () => {
    const result = getActiveMode(modes, 'b', 'nonexistent');
    expect(result?.id).toBe('b');
  });

  it('falls back to first mode when both are null', () => {
    const result = getActiveMode(modes, null);
    expect(result?.id).toBe('a');
  });

  it('returns null when modes array is empty', () => {
    const result = getActiveMode([], 'any', 'any');
    expect(result).toBeNull();
  });

  it('returns null when modes array is empty and all params null', () => {
    const result = getActiveMode([], null);
    expect(result).toBeNull();
  });
});
