// @ts-nocheck
import { LlmProviderConfig, Message } from '../../types';
import { filterModelsForTextOutput } from './modelFilter';

export class OpenAiService {
  private config: LlmProviderConfig;

  constructor(config: LlmProviderConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || 'https://api.openai.com/v1';
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/models`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models (${response.status}${response.statusText ? ` ${response.statusText}` : ''})`);
      }

      const data = await response.json();
      const rawModels = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      const supportedModels = filterModelsForTextOutput(rawModels);
      return supportedModels;
    } catch (error) {
      console.error('Error fetching models:', error);
      if (error instanceof Error) {
        throw new Error(`Unable to fetch models: ${error.message}`);
      }

      throw new Error('Unable to fetch models due to an unknown error.');
    }
  }

  async sendChatCompletion(
    messages: Message[],
    systemPrompt: string,
    tools: any[],
    onChunk: (content: string, toolCalls?: any[]) => void,
    onComplete: (fullContent: string, fullToolCalls?: any[]) => void,
    onError: (error: any) => void,
    abortSignal?: AbortSignal
  ) {
    try {
      const msgs = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => {
          const hasToolCalls = m.toolCalls && m.toolCalls.length > 0;
          const msg: any = {
            role: m.role,
            content: hasToolCalls && m.role === 'assistant' ? (m.content?.trim() ? m.content : null) : (m.content || ''),
          };
          if (hasToolCalls) {
            msg.tool_calls = m.toolCalls.map(tc => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: tc.arguments
              }
            }));
          }
          if (m.role === 'tool') {
            msg.tool_call_id = m.toolCallId;
          }
          return msg;
        })
      ];

      const body: any = {
        model: this.config.model,
        messages: msgs,
        stream: true,
      };

      if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
        body.parallel_tool_calls = true;

        // Compatibility fallback for OpenAI-like providers that still use legacy function_call.
        const isLikelyOpenAi = /api\.openai\.com/i.test(this.getBaseUrl());
        if (!isLikelyOpenAi) {
          body.functions = tools.map((tool: any) => tool.function);
          body.function_call = 'auto';
        }
      }

      const response = await fetch(`${this.getBaseUrl()}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: abortSignal,
        // @ts-ignore
        reactNative: { textStreaming: true },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API Error: ${response.status} - ${text}`);
      }

      const mergeToolCalls = (current: any[], newCalls: any[]) => {
        if (!newCalls) return current;
        const result = [...current];
        const findIndexById = (id: string) => result.findIndex(entry => entry?.id && entry.id === id);

        newCalls.forEach((call, idx) => {
          let index = typeof call.index === 'number' ? call.index : idx;
          if (index < 0 && call.id) {
            const existing = findIndexById(call.id);
            if (existing >= 0) index = existing;
          }
          if (index < 0) {
            index = result.length;
          }

          const argsChunk =
            typeof call.function?.arguments === 'string'
              ? call.function.arguments
              : call.function?.arguments
                ? JSON.stringify(call.function.arguments)
                : '';
          if (!result[index]) {
            result[index] = {
              ...call,
              function: {
                ...call.function,
                arguments: argsChunk,
              },
            };
          } else {
             if (!result[index].function) result[index].function = { arguments: '' };
             if (argsChunk) result[index].function.arguments += argsChunk;
             if (call.function?.name) result[index].function.name = call.function.name;
             if (call.id) result[index].id = call.id;
          }
        });
        return result;
      };

      let fullContent = '';
      let toolCallsBuffer: any[] = [];
      const reader = (response as any).body?.getReader();

      const emitContentChunk = async (contentChunk: string) => {
        if (!contentChunk) return;

        // Split larger chunks so UI updates stay visibly progressive even when providers batch tokens.
        const segments = contentChunk.length > 12
          ? contentChunk.match(/.{1,12}/g) || [contentChunk]
          : [contentChunk];

        for (const segment of segments) {
          if (abortSignal?.aborted) {
            throw new Error('Request cancelled by user');
          }

          fullContent += segment;
          onChunk(segment, undefined);
          await new Promise(resolve => setTimeout(resolve, 12));
        }
      };

      const processDelta = async (delta: any) => {
        if (!delta) return;
        if (delta.content) {
          await emitContentChunk(delta.content);
        }
        if (delta.tool_calls) {
          toolCallsBuffer = mergeToolCalls(toolCallsBuffer, delta.tool_calls);
          onChunk('', toolCallsBuffer);
        }
        if (delta.function_call) {
          toolCallsBuffer = mergeToolCalls(toolCallsBuffer, [
            {
              index: 0,
              id: toolCallsBuffer[0]?.id || 'legacy_function_call_0',
              type: 'function',
              function: {
                name: delta.function_call.name,
                arguments: delta.function_call.arguments || '',
              },
            },
          ]);
          onChunk('', toolCallsBuffer);
        }
      };

      const processSsePayload = async (payload: string) => {
        const cleanPayload = payload.trim();
        if (!cleanPayload || cleanPayload === '[DONE]') return;
        try {
          const json = JSON.parse(cleanPayload);
          const delta = json.choices?.[0]?.delta;
          await processDelta(delta);
        } catch (e) {
          // Ignore partial or non-JSON control events.
        }
      };
      
      if (reader) {
        const decoder = new TextDecoder();
        let pendingBuffer = '';

        while (true) {
          if (abortSignal?.aborted) {
            throw new Error('Request cancelled by user');
          }
          const { done, value } = await reader.read();
          if (done) break;
          pendingBuffer += decoder.decode(value, { stream: true });
          const events = pendingBuffer.split('\n\n');
          pendingBuffer = events.pop() || '';

          for (const event of events) {
            const dataLines = event
              .split('\n')
              .filter(line => line.startsWith('data:'))
              .map(line => line.replace(/^data:\s?/, ''));
            if (dataLines.length > 0) {
              await processSsePayload(dataLines.join('\n'));
            }
          }
        }

        if (pendingBuffer.trim().length > 0) {
          const dataLines = pendingBuffer
            .split('\n')
            .filter(line => line.startsWith('data:'))
            .map(line => line.replace(/^data:\s?/, ''));
          if (dataLines.length > 0) {
            await processSsePayload(dataLines.join('\n'));
          }
        }
        onComplete(fullContent, toolCallsBuffer.length > 0 ? toolCallsBuffer : undefined);
      } else {
        // Fallback for non-streaming reader (manual processing of the full body)
        const text = await response.text();
        const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
        const sseLines = lines.filter(line => line.startsWith('data:'));

        if (sseLines.length > 0) {
          for (const line of sseLines) {
            await processSsePayload(line.replace(/^data:\s?/, ''));
          }
        } else {
          try {
            const json = JSON.parse(text);
            const choice = json.choices?.[0];
            const message = choice?.message;
            if (message?.content) {
              await emitContentChunk(message.content);
            }
            if (message?.tool_calls) {
              toolCallsBuffer = mergeToolCalls([], message.tool_calls);
              onChunk('', toolCallsBuffer);
            }
            if (message?.function_call) {
              toolCallsBuffer = mergeToolCalls(toolCallsBuffer, [
                {
                  index: 0,
                  id: 'legacy_function_call_0',
                  type: 'function',
                  function: {
                    name: message.function_call.name,
                    arguments: message.function_call.arguments || '',
                  },
                },
              ]);
              onChunk('', toolCallsBuffer);
            }
          } catch (e) {
            throw new Error('Unable to parse model response');
          }
        }
        onComplete(fullContent, toolCallsBuffer.length > 0 ? toolCallsBuffer : undefined);
      }
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        onError(new Error('Request cancelled by user'));
        return;
      }
      onError(error);
    }
  }
}
