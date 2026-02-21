// @ts-nocheck
import { LlmProviderConfig, Message } from '../../types';

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
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();
      // Handle OpenRouter or standard OpenAI model listing
      if (data.data) {
          return data.data.map((m: any) => m.id);
      } else if (Array.isArray(data)) {
          return data.map((m: any) => m.id || m.name);
      }
      return [];
    } catch (error) {
      console.error('Error fetching models:', error);
      return [];
    }
  }

  async sendChatCompletion(
    messages: Message[],
    systemPrompt: string,
    tools: any[],
    onChunk: (content: string, toolCalls?: any[]) => void,
    onComplete: (fullContent: string, fullToolCalls?: any[]) => void,
    onError: (error: any) => void
  ) {
    try {
      const msgs = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => {
          const msg: any = { role: m.role, content: m.content || '' };
          if (m.toolCalls && m.toolCalls.length > 0) {
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
      }

      const response = await fetch(`${this.getBaseUrl()}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
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
        newCalls.forEach(call => {
          const index = call.index;
          if (!result[index]) {
            result[index] = { ...call, function: { ...call.function, arguments: '' } };
          } else {
             if (call.function?.arguments) result[index].function.arguments += call.function.arguments;
             if (call.function?.name) result[index].function.name = call.function.name;
             if (call.id) result[index].id = call.id;
          }
        });
        return result;
      };

      let fullContent = '';
      let toolCallsBuffer: any[] = [];
      const reader = (response as any).body?.getReader();
      
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine === '' || cleanLine === 'data: [DONE]') continue;
            if (cleanLine.startsWith('data: ')) {
              try {
                const json = JSON.parse(cleanLine.substring(6));
                const delta = json.choices[0]?.delta;
                if (delta?.content) {
                  fullContent += delta.content;
                  onChunk(delta.content, undefined);
                }
                if (delta?.tool_calls) {
                  toolCallsBuffer = mergeToolCalls(toolCallsBuffer, delta.tool_calls);
                  onChunk('', toolCallsBuffer);
                }
              } catch (e) {}
            }
          }
        }
        onComplete(fullContent, toolCallsBuffer.length > 0 ? toolCallsBuffer : undefined);
      } else {
        // Fallback for non-streaming reader (manual processing of the full body)
        const text = await response.text();
        const lines = text.split('\n');
        for (const line of lines) {
           const cleanLine = line.trim();
           if (cleanLine === '' || cleanLine === 'data: [DONE]') continue;
           if (cleanLine.startsWith('data: ')) {
              try {
                const json = JSON.parse(cleanLine.substring(6));
                const delta = json.choices[0]?.delta;
                if (delta?.content) {
                  fullContent += delta.content;
                  onChunk(delta.content, undefined);
                }
                if (delta?.tool_calls) {
                  toolCallsBuffer = mergeToolCalls(toolCallsBuffer, delta.tool_calls);
                }
              } catch (e) {}
           }
        }
        onComplete(fullContent, toolCallsBuffer.length > 0 ? toolCallsBuffer : undefined);
      }
    } catch (error) {
      onError(error);
    }
  }
}
