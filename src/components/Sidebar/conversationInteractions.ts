export interface PressEventLike {
  stopPropagation: () => void;
}

export const handleDeleteConversationPress = (
  event: PressEventLike,
  id: string,
  onDelete: (conversationId: string) => void
) => {
  event.stopPropagation();
  onDelete(id);
};
