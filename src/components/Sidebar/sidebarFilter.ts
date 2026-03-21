import { getSidebarConversationLabel } from '../../utils/dateFormat';

export interface SidebarConversationSummary {
  id: string;
  title?: string;
  createdAt?: number;
  updatedAt?: number;
}

export const sortAndFilterConversations = (
  conversations: SidebarConversationSummary[],
  searchQuery: string
): SidebarConversationSummary[] => {
  const sorted = [...conversations].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  if (!searchQuery.trim()) {
    return sorted;
  }

  const query = searchQuery.toLowerCase();
  return sorted.filter((conversation) => {
    const label = getSidebarConversationLabel(conversation).toLowerCase();
    return label.includes(query);
  });
};
