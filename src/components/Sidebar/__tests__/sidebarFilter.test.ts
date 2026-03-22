import { sortAndFilterConversations, SidebarConversationSummary } from '../sidebarFilter';

const items: SidebarConversationSummary[] = [
  { id: '1', title: 'Alpha Chat', updatedAt: 10, createdAt: 5 },
  { id: '2', title: 'Beta Topic', updatedAt: 30, createdAt: 7 },
  { id: '3', title: 'Gamma Notes', updatedAt: 20, createdAt: 9 },
];

describe('sortAndFilterConversations', () => {
  it('sorts conversations by updatedAt descending', () => {
    const result = sortAndFilterConversations(items, '');
    expect(result.map((item) => item.id)).toEqual(['2', '3', '1']);
  });

  it('filters by case-insensitive label query after sorting', () => {
    const result = sortAndFilterConversations(items, 'bEtA');
    expect(result.map((item) => item.id)).toEqual(['2']);
  });

  it('returns empty array when input is empty', () => {
    const result = sortAndFilterConversations([], '');
    expect(result).toEqual([]);
  });

  it('handles empty search query with unsorted updatedAt', () => {
    const unsorted = [
      { id: 'a', title: 'First', updatedAt: 5 },
      { id: 'b', title: 'Second', updatedAt: 15 },
    ];
    const result = sortAndFilterConversations(unsorted, '');
    expect(result.map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('returns empty array when no conversations match filter', () => {
    const result = sortAndFilterConversations(items, 'xyz');
    expect(result).toEqual([]);
  });

  it('handles conversations with missing updatedAt', () => {
    const withMissing = [
      { id: '1', title: 'Has Date', updatedAt: 10 },
      { id: '2', title: 'No Date' },
    ];
    const result = sortAndFilterConversations(withMissing, '');
    expect(result.map((item) => item.id)).toEqual(['1', '2']);
  });
});
