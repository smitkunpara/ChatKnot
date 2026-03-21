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
});
