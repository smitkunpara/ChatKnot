import { handleDeleteConversationPress } from '../conversationInteractions';

describe('handleDeleteConversationPress', () => {
  it('stops propagation and forwards delete action', () => {
    const stopPropagation = jest.fn();
    const deleteHandler = jest.fn();
    const event = {
      stopPropagation,
    } as never;

    handleDeleteConversationPress(event, 'conversation-1', deleteHandler);

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(deleteHandler).toHaveBeenCalledWith('conversation-1');
    expect(deleteHandler).toHaveBeenCalledTimes(1);
  });
});
