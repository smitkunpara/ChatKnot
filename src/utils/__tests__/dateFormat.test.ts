import { formatLocalDateTime, getSidebarConversationLabel, getSidebarNewChatCtaLabel } from '../dateFormat';

describe('formatLocalDateTime', () => {
  it('returns a string matching YYYY-MM-DD HH:MM pattern', () => {
    const timestamp = Date.UTC(2026, 1, 22, 6, 30, 0);
    const result = formatLocalDateTime(timestamp);
    // Locale-independent shape check: "YYYY-MM-DD HH:MM"
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/);
  });

  it('formats current time without throwing', () => {
    expect(() => formatLocalDateTime(Date.now())).not.toThrow();
  });
});

describe('getSidebarConversationLabel', () => {
  it('returns the title if it is not the placeholder', () => {
    expect(
      getSidebarConversationLabel({ title: 'My Chat', createdAt: 1000 })
    ).toBe('My Chat');
  });

  it('returns a date string for the placeholder title', () => {
    const label = getSidebarConversationLabel({ title: 'New Chat', createdAt: Date.UTC(2026, 0, 1) });
    expect(label).toMatch(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/);
  });

  it('returns a date string when title is empty', () => {
    const label = getSidebarConversationLabel({ title: '', createdAt: Date.UTC(2026, 0, 1) });
    expect(label).toMatch(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/);
  });
});

describe('getSidebarNewChatCtaLabel', () => {
  it('returns a formatted date string', () => {
    const label = getSidebarNewChatCtaLabel(Date.UTC(2026, 5, 15, 12, 0));
    expect(label).toMatch(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/);
  });
});

describe('formatLocalDateTime edge cases', () => {
  it('normalizes 24-hour midnight output to 00', () => {
    const originalDateTimeFormat = Intl.DateTimeFormat;
    const formatToParts = jest.fn(() => [
      { type: 'year', value: '2026' },
      { type: 'month', value: '03' },
      { type: 'day', value: '23' },
      { type: 'hour', value: '24' },
      { type: 'minute', value: '05' },
    ] as Intl.DateTimeFormatPart[]);

    const dateTimeFormatMock = jest.fn(() => ({
      formatToParts,
    })) as unknown as typeof Intl.DateTimeFormat;

    Intl.DateTimeFormat = dateTimeFormatMock;

    try {
      jest.isolateModules(() => {
        const { formatLocalDateTime: isolatedFormatLocalDateTime } = require('../dateFormat');
        expect(isolatedFormatLocalDateTime(Date.UTC(2026, 2, 23, 0, 5, 0))).toBe('2026-03-23 00:05');
      });
    } finally {
      Intl.DateTimeFormat = originalDateTimeFormat;
    }
  });
});
