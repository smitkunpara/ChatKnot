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
});
