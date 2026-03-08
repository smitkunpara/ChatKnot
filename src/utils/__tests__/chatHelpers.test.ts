import { buildEffectiveSystemPrompt, buildAppSystemPrompt } from '../chatHelpers.ts';

describe('buildEffectiveSystemPrompt', () => {
  it('uses conversationPrompt when present', () => {
    const result = buildEffectiveSystemPrompt({
      conversationPrompt: 'Conversation level prompt',
      modePrompt: 'Mode prompt',
      globalPrompt: 'Global prompt',
    });
    expect(result).toBe('Conversation level prompt');
  });

  it('falls back to modePrompt when conversationPrompt is empty', () => {
    const result = buildEffectiveSystemPrompt({
      conversationPrompt: '',
      modePrompt: 'Mode prompt',
      globalPrompt: 'Global prompt',
    });
    expect(result).toBe('Mode prompt');
  });

  it('falls back to modePrompt when conversationPrompt is whitespace', () => {
    const result = buildEffectiveSystemPrompt({
      conversationPrompt: '   ',
      modePrompt: 'Mode prompt',
    });
    expect(result).toBe('Mode prompt');
  });

  it('falls back to globalPrompt when both conversationPrompt and modePrompt are empty', () => {
    const result = buildEffectiveSystemPrompt({
      conversationPrompt: '',
      modePrompt: '',
      globalPrompt: 'Global prompt',
    });
    expect(result).toBe('Global prompt');
  });

  it('falls back to default when all prompts are empty', () => {
    const result = buildEffectiveSystemPrompt({
      conversationPrompt: '',
      modePrompt: '',
      globalPrompt: '',
    });
    expect(result).toBe('You are a helpful AI assistant.');
  });

  it('falls back to default when no prompts provided', () => {
    const result = buildEffectiveSystemPrompt({});
    expect(result).toBe('You are a helpful AI assistant.');
  });

  it('trims whitespace from the selected prompt', () => {
    const result = buildEffectiveSystemPrompt({
      modePrompt: '  Trimmed mode  ',
    });
    expect(result).toBe('Trimmed mode');
  });
});

describe('buildAppSystemPrompt', () => {
  it('includes markdown instructions by default', () => {
    const result = buildAppSystemPrompt({
      toolsEnabledForRequest: false,
      hasConnectedMcpServer: false,
    });
    expect(result).toContain('Always respond in Markdown');
  });

  it('includes tool call guidance when tools enabled', () => {
    const result = buildAppSystemPrompt({
      toolsEnabledForRequest: true,
      hasConnectedMcpServer: false,
    });
    expect(result).toContain('Multiple tool calls');
  });

  it('does not include tool call guidance when tools disabled', () => {
    const result = buildAppSystemPrompt({
      toolsEnabledForRequest: false,
      hasConnectedMcpServer: false,
    });
    expect(result).not.toContain('Multiple tool calls');
  });
});
