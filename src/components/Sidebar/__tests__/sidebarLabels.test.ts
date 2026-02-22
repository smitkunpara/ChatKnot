import {
  getSidebarConversationLabel,
  getSidebarNewChatCtaLabel,
} from '../../../utils/dateFormat.ts';

describe('sidebar labels', () => {
  it('uses explicit conversation title when it is not the New Chat placeholder', () => {
    const label = getSidebarConversationLabel({
      title: 'How to deploy release',
      createdAt: Date.UTC(2026, 1, 22, 6, 30, 0),
      updatedAt: Date.UTC(2026, 1, 22, 8, 0, 0),
    });

    expect(label).toBe('How to deploy release');
  });

  it('uses createdAt for New Chat placeholder titles', () => {
    const label = getSidebarConversationLabel({
      title: 'New Chat',
      createdAt: Date.UTC(2026, 1, 22, 6, 30, 0),
      updatedAt: Date.UTC(2026, 1, 22, 8, 0, 0),
    });

    expect(label).toBe('2026-02-22 12:00 IST');
  });

  it('falls back to updatedAt for legacy conversations missing createdAt', () => {
    const label = getSidebarConversationLabel({
      title: 'New Chat',
      updatedAt: Date.UTC(2026, 1, 22, 8, 0, 0),
    });

    expect(label).toBe('2026-02-22 13:30 IST');
  });

  it('formats top CTA label as IST date-time', () => {
    const label = getSidebarNewChatCtaLabel(Date.UTC(2026, 1, 22, 10, 0, 0));

    expect(label).toBe('2026-02-22 15:30 IST');
  });
});
