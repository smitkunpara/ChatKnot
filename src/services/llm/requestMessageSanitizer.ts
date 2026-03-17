import { LlmProviderConfig, Message } from '../../types';

export type ResolvedModelCapabilities = {
  vision: boolean;
  fileInput: boolean;
  tools: boolean;
};

export const resolveModelCapabilities = (
  provider: LlmProviderConfig | undefined,
  model: string
): ResolvedModelCapabilities => {
  if (!provider) {
    return {
      vision: true,
      fileInput: true,
      tools: false,
    };
  }

  const capabilityMap = provider.modelCapabilities || {};
  const hasCapabilityMap = Object.keys(capabilityMap).length > 0;
  const caps = capabilityMap[model];

  if (caps) {
    return {
      vision: !!caps.vision,
      fileInput: !!caps.fileInput,
      tools: !!caps.tools,
    };
  }

  if (!hasCapabilityMap) {
    return {
      vision: true,
      fileInput: true,
      // If model metadata is missing, default to no tool-calling support.
      // This prevents sending MCP tool schemas to unknown-capability models.
      tools: false,
    };
  }

  return {
    // Capabilities are independent: unknown model entry should not block
    // image/file inputs by default, but tool-calling remains opt-in.
    vision: true,
    fileInput: true,
    tools: false,
  };
};

export const sanitizeMessagesForRequest = (
  messages: Message[],
  capabilities: ResolvedModelCapabilities
): Message[] => {

  const baseMessages = capabilities.tools
    ? messages
    : messages.filter(message => message.role !== 'tool');

  const result = baseMessages.map((message) => {
    let nextMessage = message;
    let changed = false;

    if (!capabilities.tools && message.toolCalls && message.toolCalls.length > 0) {
      nextMessage = { ...nextMessage };
      delete nextMessage.toolCalls;
      changed = true;
    }

    if (message.role === 'user' && message.attachments && message.attachments.length > 0) {
      const filteredAttachments = message.attachments.filter((attachment) => {
        if (attachment.type === 'image') {
          return capabilities.vision;
        }

        if (attachment.type === 'file') {
          return capabilities.fileInput;
        }

        return true;
      });

      if (filteredAttachments.length !== message.attachments.length) {
        if (!changed) {
          nextMessage = { ...nextMessage };
          changed = true;
        }

        if (filteredAttachments.length > 0) {
          nextMessage.attachments = filteredAttachments;
        } else {
          delete nextMessage.attachments;
        }
      }
    }

    return changed ? nextMessage : message;
  });

  return result;
};
