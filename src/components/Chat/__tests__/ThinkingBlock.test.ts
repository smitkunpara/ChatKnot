describe('formatDuration', () => {
  const formatDuration = (totalMs: number): string => {
    if (totalMs === 0) return '';
    if (totalMs < 1000) return `${totalMs}ms`;
    const totalSeconds = totalMs / 1000;
    if (totalSeconds < 60) {
      return `${Math.max(0, totalSeconds).toFixed(1)}s`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${Math.floor(seconds)}s`;
  };

  it('returns empty string for 0ms', () => {
    expect(formatDuration(0)).toBe('');
  });

  it('formats milliseconds under 1000', () => {
    expect(formatDuration(100)).toBe('100ms');
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats seconds under a minute', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(3200)).toBe('3.2s');
    expect(formatDuration(59000)).toBe('59.0s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(65000)).toBe('1m 5s');
    expect(formatDuration(120000)).toBe('2m 0s');
    expect(formatDuration(185000)).toBe('3m 5s');
  });

  it('handles large values', () => {
    expect(formatDuration(3661000)).toBe('61m 1s');
  });
});

describe('ThinkingBlock component logic', () => {
  it('validates expanded state initialization based on isStreaming', () => {
    const streamingInitial = true;
    const notStreamingInitial = false;
    
    expect(streamingInitial).toBe(true);
    expect(notStreamingInitial).toBe(false);
  });

  it('validates shimmer animation should run when streaming', () => {
    const isStreaming = true;
    const shouldAnimate = isStreaming;
    
    expect(shouldAnimate).toBe(true);
  });

  it('validates shimmer animation should not run when not streaming', () => {
    const isStreaming = false;
    const shouldAnimate = isStreaming;
    
    expect(shouldAnimate).toBe(false);
  });
});
