import { formatIstDateTime } from '../dateFormat.ts';

describe('dateFormat', () => {
  it('formats a timestamp in IST deterministically', () => {
    const timestamp = Date.UTC(2026, 1, 22, 6, 30, 0);

    expect(formatIstDateTime(timestamp)).toBe('2026-02-22 12:00 IST');
  });

  it('handles day rollover in IST', () => {
    const timestamp = Date.UTC(2026, 1, 22, 20, 45, 0);

    expect(formatIstDateTime(timestamp)).toBe('2026-02-23 02:15 IST');
  });
});
