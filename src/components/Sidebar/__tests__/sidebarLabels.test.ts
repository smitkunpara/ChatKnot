import {
  getSidebarConversationLabel,
  getSidebarNewChatCtaLabel,
} from '../../../utils/dateFormat';

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

    // Locale-independent format check: YYYY-MM-DD HH:MM
    expect(label).toMatch(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/);
  });

  it('falls back to updatedAt for legacy conversations missing createdAt', () => {
    const label = getSidebarConversationLabel({
      title: 'New Chat',
      updatedAt: Date.UTC(2026, 1, 22, 8, 0, 0),
    });

    expect(label).toMatch(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/);
  });

  it('formats top CTA label as local date-time', () => {
    const label = getSidebarNewChatCtaLabel(Date.UTC(2026, 1, 22, 10, 0, 0));

    expect(label).toMatch(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/);
  });
});
