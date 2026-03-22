import { getContextLimitForModel, formatTokenCount } from '../modelContextLimits';

describe('getContextLimitForModel', () => {
  it('returns exact match for known models', () => {
    expect(getContextLimitForModel('gpt-4o')).toBe(128000);
    expect(getContextLimitForModel('claude-3-5-sonnet')).toBe(200000);
    expect(getContextLimitForModel('gemini-1.5-pro')).toBe(2097152);
    expect(getContextLimitForModel('gpt-4')).toBe(8192);
    expect(getContextLimitForModel('gpt-3.5-turbo')).toBe(16385);
  });

  it('is case-insensitive', () => {
    expect(getContextLimitForModel('GPT-4O')).toBe(128000);
    expect(getContextLimitForModel('Claude-3-5-Sonnet')).toBe(200000);
  });

  it('trims whitespace', () => {
    expect(getContextLimitForModel('  gpt-4o  ')).toBe(128000);
  });

  it('matches versioned models by prefix', () => {
    expect(getContextLimitForModel('gpt-4o-2024-08-06')).toBe(128000);
    expect(getContextLimitForModel('claude-3-5-sonnet-20241022')).toBe(200000);
    expect(getContextLimitForModel('llama-3.1-405b')).toBe(131072);
  });

  it('matches unknown prefixed models to known entries', () => {
    expect(getContextLimitForModel('gpt-4-turbo-preview-2025')).toBe(128000);
    expect(getContextLimitForModel('deepseek-chat-custom')).toBe(128000);
    expect(getContextLimitForModel('gpt-4-unknown-variant')).toBe(8192);
  });

  it('falls back to family patterns for truly unknown models', () => {
    expect(getContextLimitForModel('gpt-3.5-turbo-9999')).toBe(16385);
    expect(getContextLimitForModel('claude-next-gen')).toBe(200000);
    expect(getContextLimitForModel('gemini-ultra')).toBe(1048576);
    expect(getContextLimitForModel('deepseek-new-model')).toBe(128000);
    expect(getContextLimitForModel('llama-4-100b')).toBe(131072);
    expect(getContextLimitForModel('mistral-new')).toBe(32000);
    expect(getContextLimitForModel('mixtral-8x100b')).toBe(32000);
    expect(getContextLimitForModel('qwen-3-120b')).toBe(131072);
    expect(getContextLimitForModel('command-r-v2')).toBe(128000);
  });

  it('returns default for completely unknown models', () => {
    expect(getContextLimitForModel('totally-unknown-model')).toBe(128000);
    expect(getContextLimitForModel('custom-fine-tuned')).toBe(128000);
  });

  it('returns default for empty or falsy input', () => {
    expect(getContextLimitForModel('')).toBe(128000);
  });

  it('does not false-positive match via substring (includes)', () => {
    expect(getContextLimitForModel('my-custom-llama-finetune')).toBe(131072);
  });
});

describe('formatTokenCount', () => {
  it('formats millions with one decimal', () => {
    expect(formatTokenCount(1000000)).toBe('1.0M');
    expect(formatTokenCount(2097152)).toBe('2.1M');
    expect(formatTokenCount(1500000)).toBe('1.5M');
  });

  it('formats thousands with one decimal', () => {
    expect(formatTokenCount(1000)).toBe('1.0K');
    expect(formatTokenCount(8192)).toBe('8.2K');
    expect(formatTokenCount(128000)).toBe('128.0K');
    expect(formatTokenCount(999999)).toBe('1000.0K');
  });

  it('returns raw number for values below 1000', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(1)).toBe('1');
    expect(formatTokenCount(999)).toBe('999');
  });

  it('handles negative numbers', () => {
    expect(formatTokenCount(-1)).toBe('-1');
    expect(formatTokenCount(-500)).toBe('-500');
  });
});
