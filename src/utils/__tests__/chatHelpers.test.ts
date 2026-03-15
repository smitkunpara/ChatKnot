import { getErrorMessage, serializeToolExecutionError } from '../chatHelpers';

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
