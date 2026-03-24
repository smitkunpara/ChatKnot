import { Conversation, Message } from '../../types';

export interface JsonExportOptions {
  includeToolInput: boolean;
  includeToolOutput: boolean;
  includeThinking?: boolean;
}

interface OpenAiToolCallFunction {
  name: string;
  arguments?: string;
}

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: OpenAiToolCallFunction;
}

interface OpenAiMessage {
  role: string;
  content: string;
  reasoning?: string;
  tool_call_id?: string;
  tool_calls?: OpenAiToolCall[];
}

interface ExportPayload {
  title: string;
  created_at: number;
  updated_at: number;
  system_prompt: string;
  messages: OpenAiMessage[];
}

export function toJson(conversation: Conversation, opts: JsonExportOptions): string {
  const toolMessages = conversation.messages.filter(m => m.role === 'tool');

  const openAiMessages: OpenAiMessage[] = conversation.messages
    .filter(m => {
      if (m.role === 'system') return !!m.content?.trim();
      if (m.role === 'tool') return opts.includeToolOutput;
      return true;
    })
    .map(msg => {
      const base: OpenAiMessage = {
        role: msg.role,
        content: msg.content || '',
      };

      if (opts.includeThinking && msg.reasoning?.trim()) {
        base.reasoning = msg.reasoning.trim();
      }

      if (msg.toolCallId) {
        base.tool_call_id = msg.toolCallId;
      }

      if (msg.toolCalls?.length) {
        const toolCallsArray: OpenAiToolCall[] = [];

        for (const tc of msg.toolCalls) {
          const fn: OpenAiToolCallFunction = {
            name: tc.name,
          };

          if (opts.includeToolInput && tc.arguments) {
            fn.arguments = tc.arguments;
          }

          const toolCall: OpenAiToolCall = {
            id: tc.id,
            type: 'function',
            function: fn,
          };

          toolCallsArray.push(toolCall);
        }

        base.tool_calls = toolCallsArray;
      }

      return base;
    });

  const payload: ExportPayload = {
    title: conversation.title,
    created_at: conversation.createdAt || conversation.updatedAt,
    updated_at: conversation.updatedAt,
    system_prompt: conversation.systemPrompt,
    messages: openAiMessages,
  };

  return JSON.stringify(payload, null, 2);
}
