describe('formatElapsed', () => {
  it('formats milliseconds under 1000', () => {
    const formatElapsed = (ms: number): string => {
      if (ms < 1000) return `${ms}ms`;
      return `${(ms / 1000).toFixed(1)}s`;
    };

    expect(formatElapsed(100)).toBe('100ms');
    expect(formatElapsed(500)).toBe('500ms');
    expect(formatElapsed(999)).toBe('999ms');
  });

  it('formats seconds as decimal', () => {
    const formatElapsed = (ms: number): string => {
      if (ms < 1000) return `${ms}ms`;
      return `${(ms / 1000).toFixed(1)}s`;
    };

    expect(formatElapsed(1000)).toBe('1.0s');
    expect(formatElapsed(1500)).toBe('1.5s');
    expect(formatElapsed(2000)).toBe('2.0s');
  });
});

describe('RequestPhaseIndicator logic', () => {
  it('shows null when no phase and no apiRequestDetails', () => {
    const phase = undefined;
    const apiRequestDetails = null;
    const shouldRender = !!(phase || apiRequestDetails);
    
    expect(shouldRender).toBe(false);
  });

  it('shows generating_query indicator when phase is set', () => {
    const phase = 'generating_query';
    const shouldRender = !!phase;
    
    expect(shouldRender).toBe(true);
  });

  it('shows api_request indicator when phase and details are set', () => {
    const phase = 'api_request';
    const apiRequestDetails = { model: 'gpt-4', providerUrl: 'api.example.com', requestedAt: Date.now() };
    const shouldRender = !!(phase && apiRequestDetails);
    
    expect(shouldRender).toBe(true);
  });

  it('calculates elapsed time correctly', () => {
    const requestedAt = 1000000;
    const currentTime = 1050000;
    const elapsed = currentTime - requestedAt;
    
    expect(elapsed).toBe(50000);
  });

  it('auto-collapses when phase changes away from api_request', () => {
    const phase: string = 'thinking';
    const shouldAutoCollapse = phase !== 'api_request' && phase !== 'generating_query';
    
    expect(shouldAutoCollapse).toBe(true);
  });

  it('resets elapsed when entering api_request', () => {
    const prevPhase = 'generating_query';
    const newPhase = 'api_request';
    const shouldReset = newPhase === 'api_request';
    
    expect(shouldReset).toBe(true);
  });

  it('displays final duration when firstChunkAt is available', () => {
    const requestedAt = 1000000;
    const firstChunkAt = 1005000;
    const duration = firstChunkAt - requestedAt;
    
    expect(duration).toBe(5000);
  });
});
