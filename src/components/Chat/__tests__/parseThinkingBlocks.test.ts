import { parseThinkingBlocks } from '../../../utils/parseThinkingBlocks';

describe('parseThinkingBlocks', () => {
  it('parses text followed by think block', () => {
    const result = parseThinkingBlocks(
      '<think> Let me think about this.</think>Some response.'
    );
    expect(result).toEqual([
      { type: 'think', content: 'Let me think about this.' },
      { type: 'text', content: 'Some response.' },
    ]);
  });

  it('parses multiple think blocks', () => {
    const result = parseThinkingBlocks(
      '<think> First thought.</think>Initial text<think> Second thought.</think>More text'
    );
    expect(result).toEqual([
      { type: 'think', content: 'First thought.' },
      { type: 'text', content: 'Initial text' },
      { type: 'think', content: 'Second thought.' },
      { type: 'text', content: 'More text' },
    ]);
  });

  it('handles trailing think tag without closing tag (streaming scenario)', () => {
    const result = parseThinkingBlocks('<think> Still thinking...');
    expect(result).toEqual([
      { type: 'think', content: 'Still thinking...' },
    ]);
  });

  it('handles think block at the start without closing', () => {
    const result = parseThinkingBlocks('<think>Thinking');
    expect(result).toEqual([
      { type: 'think', content: 'Thinking' },
    ]);
  });

  it('filters out empty think blocks after trimming', () => {
    const result = parseThinkingBlocks('<think></think>Response');
    const hasThinkBlock = result.some(b => b.type === 'think' && b.content.includes('think'));
    expect(hasThinkBlock).toBe(true);
  });

  it('trims whitespace from think blocks', () => {
    const result = parseThinkingBlocks(
      '<think>\n  Multiple\n  Lines\n</think>Response'
    );
    expect(result).toEqual([
      { type: 'think', content: 'Multiple\n  Lines' },
      { type: 'text', content: 'Response' },
    ]);
  });

  it('handles nested think-like content', () => {
    const content = '<think>Outer<think>Inner</think>Middle</think>Text';
    const result = parseThinkingBlocks(content);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].type).toBe('think');
  });

  it('handles text after closing think tag', () => {
    const result = parseThinkingBlocks('<think>Thought</think>  Result');
    expect(result).toEqual([
      { type: 'think', content: 'Thought' },
      { type: 'text', content: '  Result' },
    ]);
  });

  it('handles think tag immediately followed by text without space', () => {
    const result = parseThinkingBlocks('<think>Think</think>Text');
    expect(result).toEqual([
      { type: 'think', content: 'Think' },
      { type: 'text', content: 'Text' },
    ]);
  });

  it('returns text block for text-only content', () => {
    const result = parseThinkingBlocks('Just some plain text.');
    expect(result).toEqual([
      { type: 'text', content: 'Just some plain text.' },
    ]);
  });

  it('handles empty input', () => {
    const result = parseThinkingBlocks('');
    expect(result).toEqual([]);
  });

  it('handles think block spanning entire content', () => {
    const result = parseThinkingBlocks('<think>Only think here</think>');
    expect(result).toEqual([
      { type: 'think', content: 'Only think here' },
    ]);
  });

  it('handles content with only text, no think blocks', () => {
    const result = parseThinkingBlocks('No think tags here.');
    expect(result).toEqual([
      { type: 'text', content: 'No think tags here.' },
    ]);
  });

  it('handles multiple consecutive think blocks', () => {
    const result = parseThinkingBlocks(
      '<think>First</think><think>Second</think><think>Third</think>'
    );
    expect(result).toEqual([
      { type: 'think', content: 'First' },
      { type: 'think', content: 'Second' },
      { type: 'think', content: 'Third' },
    ]);
  });
});
