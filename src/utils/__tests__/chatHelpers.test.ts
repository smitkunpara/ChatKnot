import { buildAppSystemPrompt, getErrorMessage, serializeToolExecutionError } from '../chatHelpers';

describe('serializeToolExecutionError', () => {
  it('preserves structured MCP/OpenAPI payloads so the AI sees all fields', () => {
    const error = {
      data: {
        detail: "Invalid expiry date '24-Oct-2024' for NIFTY.",
        valid_dates: ['31-Oct-2024', '07-Nov-2024'],
      },
    };

    expect(serializeToolExecutionError(error)).toBe(
      JSON.stringify(error.data, null, 2)
    );
  });

  it('falls back to a readable message when no structured payload exists', () => {
    const error = new Error('plain tool failure');

    expect(serializeToolExecutionError(error)).toBe(getErrorMessage(error));
  });
});

describe('buildAppSystemPrompt', () => {
  it('includes explicit multi-tool queue instructions when tools are enabled', () => {
    const prompt = buildAppSystemPrompt({
      toolsEnabledForRequest: true,
      hasConnectedMcpServer: true,
      modeName: 'Agent',
      currentDateTime: '2026-03-16 12:00',
    });

    expect(prompt).toContain('MCP tool calling is enabled for this request.');
    expect(prompt).toContain('You may request zero, one, or multiple tool calls in a single assistant turn.');
    expect(prompt).toContain('Tool calls are executed in a queue; each tool result is appended to the conversation before your next turn.');
    expect(prompt).toContain('Do not repeat identical tool calls unless inputs have changed or a retry is explicitly required.');
  });

  it('includes mode name in prompt when provided', () => {
    const prompt = buildAppSystemPrompt({
      toolsEnabledForRequest: false,
      hasConnectedMcpServer: false,
      modeName: 'Code Reviewer',
    });

    expect(prompt).toContain('Code Reviewer');
    expect(prompt).toContain('mode');
  });

  it('does not include mode name when not provided', () => {
    const prompt = buildAppSystemPrompt({
      toolsEnabledForRequest: false,
      hasConnectedMcpServer: false,
    });

    expect(prompt).not.toContain('mode');
    expect(prompt).toContain('Application default instructions:');
  });

  it('includes current date and time when provided', () => {
    const prompt = buildAppSystemPrompt({
      toolsEnabledForRequest: false,
      hasConnectedMcpServer: false,
      currentDateTime: '2026-03-22 14:30',
    });

    expect(prompt).toContain('2026-03-22 14:30');
  });

  it('includes MCP server availability notice when connected', () => {
    const prompt = buildAppSystemPrompt({
      toolsEnabledForRequest: false,
      hasConnectedMcpServer: true,
    });

    expect(prompt).toContain('MCP tools are currently connected and available');
  });
});
