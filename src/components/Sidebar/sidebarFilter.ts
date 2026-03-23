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
  const sorted = [...conversations].sort((a, b) => {
    const updatedAtDiff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    if (updatedAtDiff !== 0) {
      return updatedAtDiff;
    }

    const createdAtDiff = (b.createdAt ?? 0) - (a.createdAt ?? 0);
    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }

    return a.id.localeCompare(b.id);
  });
  if (!searchQuery.trim()) {
    return sorted;
  }

  const query = searchQuery.toLowerCase();
  return sorted.filter((conversation) => {
    const label = getSidebarConversationLabel(conversation).toLowerCase();
    return label.includes(query);
  });
};
