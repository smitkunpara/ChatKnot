import {
  formatToolFailureMessage,
  serializeToolFailurePayload,
} from '../chatToolFailureHelpers';

describe('chatToolFailureHelpers', () => {
  it('formats known tool failure messages', () => {
    expect(formatToolFailureMessage('TOOL_NOT_FOUND', 'weather.search')).toContain('not available');
    expect(formatToolFailureMessage('TOOL_DISABLED', 'weather.search')).toContain('disabled');
    expect(formatToolFailureMessage('TOOL_PERMISSION_DENIED', 'weather.search')).toContain('denied');
  });

  it('formats unknown tool failure codes with default message', () => {
    const result = formatToolFailureMessage('UNKNOWN_CODE' as any, 'tool.name');
    expect(result).toContain('tool.name');
    expect(result).toContain('failed');
  });

  it('serializes failure payload shape for tool messages', () => {
    const message = 'Tool unavailable';
    const raw = serializeToolFailurePayload('TOOL_NOT_FOUND', 'weather.search', message);
    const parsed = JSON.parse(raw);

    expect(parsed).toEqual({
      error: 'TOOL_NOT_FOUND',
      tool: 'weather.search',
      message,
    });
  });
});
