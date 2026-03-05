import { LlmProviderConfig, Message, ModelCapabilities } from '../../types';
import { filterModelsForTextOutput } from './modelFilter';

import { DEFAULT_OPENAI_BASE_URL } from '../../constants/api';

export interface ModelsWithCapabilities {
  models: string[];
  capabilities: Record<string, ModelCapabilities>;
}

export class OpenAiService {
  private config: LlmProviderConfig;

  constructor(config: LlmProviderConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    const configuredBaseUrl = (this.config.baseUrl || '').trim();
    const fallbackBaseUrl = DEFAULT_OPENAI_BASE_URL;
    const normalizedBaseUrl = (configuredBaseUrl || fallbackBaseUrl).replace(/\/+$/, '');
    const finalBaseUrl = normalizedBaseUrl || fallbackBaseUrl;

    try {
      const parsed = new URL(finalBaseUrl);
      if (parsed.hostname === '0.0.0.0') {
        throw new Error(
          'Invalid base URL host "0.0.0.0". Use a reachable client host such as 127.0.0.1, 10.0.2.2 (Android emulator), or your machine LAN IP.'
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
    }

    return finalBaseUrl;
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const apiKey = (this.config.apiKey || '').trim();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
      headers['x-api-key'] = apiKey;
      headers['api-key'] = apiKey;
    }

    return headers;
  }

  private getModelEndpointCandidates(): string[] {
    const baseUrl = this.getBaseUrl();
    const candidates = new Set<string>();
    const addCandidate = (urlPrefix: string) => {
      const normalizedPrefix = (urlPrefix || '').replace(/\/+$/, '');
      if (!normalizedPrefix) return;
      candidates.add(`${normalizedPrefix}/models`);
    };

    addCandidate(baseUrl);

    try {
      const parsed = new URL(baseUrl);
      const normalizedPath = parsed.pathname.replace(/\/+$/, '');
      const hasVersionSuffix = /\/v\d+$/i.test(normalizedPath);

      if (hasVersionSuffix) {
        const trimmedPath = normalizedPath.replace(/\/v\d+$/i, '');
        parsed.pathname = trimmedPath || '/';
        parsed.search = '';
        parsed.hash = '';
        addCandidate(parsed.toString());
      } else {
        const slashPrefix = normalizedPath && normalizedPath !== '/' ? normalizedPath : '';
        parsed.pathname = `${slashPrefix}/v1`;
        parsed.search = '';
        parsed.hash = '';
        addCandidate(parsed.toString());
      }
    } catch {
      // Ignore malformed URLs; the primary candidate will still be attempted.
    }

    return Array.from(candidates);
  }

  private async fetchModelsPayload(): Promise<any> {
    const endpointCandidates = this.getModelEndpointCandidates();
    let lastError: Error | null = null;

    for (let index = 0; index < endpointCandidates.length; index += 1) {
      const endpoint = endpointCandidates[index];
      const hasFallback = index < endpointCandidates.length - 1;

      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: this.getHeaders(),
        });

        if (!response.ok) {
          const statusLabel = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;

          if ((response.status === 404 || response.status === 405) && hasFallback) {
            lastError = new Error(`Failed to fetch models from ${endpoint} (${statusLabel})`);
            continue;
          }

          const responseText =
            typeof (response as any).text === 'function'
              ? await response.text().catch(() => '')
              : '';
          const compactBody = responseText.replace(/\s+/g, ' ').trim();
          const bodyPreview = compactBody ? `: ${compactBody.slice(0, 180)}` : '';
          throw new Error(`Failed to fetch models from ${endpoint} (${statusLabel})${bodyPreview}`);
        }

        return await response.json();
      } catch (error) {
        if (error instanceof Error) {
          lastError = error;
        } else {
          lastError = new Error(String(error));
        }

        if (hasFallback) {
          continue;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error('Failed to fetch models from all candidate endpoints.');
  }

  private static getNestedValue(source: any, path: string[]): any {
    return path.reduce((value, key) => {
      if (value == null || typeof value !== 'object') {
        return undefined;
      }
      return value[key];
    }, source);
  }

  private static toStringArray(value: any): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
      .filter(Boolean);
  }

  private static parseBoolean(value: any): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (value === 1) return true;
      if (value === 0) return false;
      return undefined;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 'yes', '1'].includes(normalized)) return true;
      if (['false', 'no', '0'].includes(normalized)) return false;
    }
    return undefined;
  }

  private static getBooleanAtPaths(source: any, paths: string[][]): boolean | undefined {
    for (const path of paths) {
      const parsed = OpenAiService.parseBoolean(OpenAiService.getNestedValue(source, path));
      if (parsed !== undefined) {
        return parsed;
      }
    }
    return undefined;
  }

  private static collectTokens(source: any, paths: string[][]): Set<string> {
    const tokens = new Set<string>();
    for (const path of paths) {
      const value = OpenAiService.getNestedValue(source, path);
      for (const token of OpenAiService.toStringArray(value)) {
        tokens.add(token);
      }
    }
    return tokens;
  }

  private static extractModelList(data: any): any[] {
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.models)) return data.models;
    if (Array.isArray(data?.result?.data)) return data.result.data;
    if (Array.isArray(data)) return data;
    return [];
  }

  private static hasAnyToken(tokens: Set<string>, matches: string[]): boolean {
    const tokenArray = Array.from(tokens);
    for (const token of tokenArray) {
      for (const match of matches) {
        if (token === match || token.includes(match)) {
          return true;
        }
      }
    }
    return false;
  }

  private static extractCapabilities(model: any): ModelCapabilities | null {
    const modalityTokens = OpenAiService.collectTokens(model, [
      ['architecture', 'input_modalities'],
      ['architecture', 'output_modalities'],
      ['input_modalities'],
      ['output_modalities'],
      ['supported_input_modalities'],
      ['supported_output_modalities'],
      ['modalities'],
      ['modalities', 'input'],
      ['modalities', 'output'],
      ['capabilities', 'modalities'],
      ['capabilities', 'input_modalities'],
      ['capabilities', 'output_modalities'],
      ['capabilities', 'input'],
      ['capabilities', 'output'],
      ['model_capabilities', 'modalities'],
      ['model_capabilities', 'input_modalities'],
      ['model_capabilities', 'output_modalities'],
      ['model_capabilities', 'input'],
      ['model_capabilities', 'output'],
    ]);

    const parameterTokens = OpenAiService.collectTokens(model, [
      ['supported_parameters'],
      ['supported_params'],
      ['parameters'],
      ['capabilities', 'supported_parameters'],
      ['capabilities', 'supported_params'],
      ['capabilities', 'parameters'],
      ['model_capabilities', 'supported_parameters'],
      ['model_capabilities', 'supported_params'],
      ['model_capabilities', 'parameters'],
    ]);

    const featureTokens = OpenAiService.collectTokens(model, [
      ['features'],
      ['supported_features'],
      ['capabilities', 'features'],
      ['model_capabilities', 'features'],
    ]);

    const toolTokens = new Set<string>();
    Array.from(parameterTokens).forEach(t => toolTokens.add(t));
    Array.from(featureTokens).forEach(t => toolTokens.add(t));

    const explicitVision = OpenAiService.getBooleanAtPaths(model, [
      ['supports_vision'],
      ['supports_images'],
      ['vision'],
      ['capabilities', 'vision'],
      ['capabilities', 'supports_vision'],
      ['capabilities', 'supports_images'],
      ['model_capabilities', 'vision'],
      ['model_capabilities', 'supports_vision'],
      ['model_capabilities', 'supports_images'],
    ]);

    const explicitTools = OpenAiService.getBooleanAtPaths(model, [
      ['supports_tools'],
      ['tools'],
      ['tool_calling'],
      ['supports_tool_calling'],
      ['function_calling'],
      ['supports_function_calling'],
      ['capabilities', 'tools'],
      ['capabilities', 'supports_tools'],
      ['capabilities', 'tool_calling'],
      ['capabilities', 'supports_tool_calling'],
      ['capabilities', 'function_calling'],
      ['capabilities', 'supports_function_calling'],
      ['model_capabilities', 'tools'],
      ['model_capabilities', 'supports_tools'],
      ['model_capabilities', 'tool_calling'],
      ['model_capabilities', 'supports_tool_calling'],
      ['model_capabilities', 'function_calling'],
      ['model_capabilities', 'supports_function_calling'],
    ]);

    const explicitFileInput = OpenAiService.getBooleanAtPaths(model, [
      ['supports_file_input'],
      ['supports_files'],
      ['file_input'],
      ['capabilities', 'file_input'],
      ['capabilities', 'supports_file_input'],
      ['capabilities', 'supports_files'],
      ['model_capabilities', 'file_input'],
      ['model_capabilities', 'supports_file_input'],
      ['model_capabilities', 'supports_files'],
    ]);

    const inferredVision = modalityTokens.size > 0
      ? OpenAiService.hasAnyToken(modalityTokens, ['image', 'vision', 'multimodal'])
      : undefined;
    const inferredFileInput = modalityTokens.size > 0
      ? OpenAiService.hasAnyToken(modalityTokens, ['file', 'files', 'document', 'pdf'])
      : undefined;
    const inferredTools = toolTokens.size > 0
      ? OpenAiService.hasAnyToken(toolTokens, [
        'tools',
        'tool_calling',
        'function_calling',
        'function_call',
        'functions',
        'parallel_tool_calls',
      ])
      : undefined;

    const hasSignals =
      explicitVision !== undefined ||
      explicitTools !== undefined ||
      explicitFileInput !== undefined ||
      modalityTokens.size > 0 ||
      parameterTokens.size > 0 ||
      featureTokens.size > 0;

    if (!hasSignals) return null;

    return {
      // Keep permissive fallback for unknown modalities to avoid blocking attachments
      // on providers that expose partial capability metadata.
      vision: explicitVision ?? inferredVision ?? true,
      // Tool-calling remains opt-in by metadata.
      tools: explicitTools ?? inferredTools ?? false,
      fileInput: explicitFileInput ?? inferredFileInput ?? true,
    };
  }

  async listModels(): Promise<string[]> {
    const result = await this.listModelsWithCapabilities();
    return result.models;
  }

  async listModelsWithCapabilities(): Promise<ModelsWithCapabilities> {
    try {
      const data = await this.fetchModelsPayload();
      const rawModels = OpenAiService.extractModelList(data);
      const supportedModels = filterModelsForTextOutput(rawModels);

      const capabilities: Record<string, ModelCapabilities> = {};
      for (const model of rawModels) {
        const id = typeof model === 'string' ? model : model?.id || model?.name || '';
        if (id && supportedModels.includes(id)) {
          const caps = OpenAiService.extractCapabilities(model);
          if (caps) {
            capabilities[id] = caps;
          }
        }
      }

      return { models: supportedModels, capabilities };
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
    userSystemPrompt: string,
    appSystemPrompt: string | undefined,
    tools: any[],
    onChunk: (content: string, toolCalls?: any[]) => void,
    onComplete: (fullContent: string, fullToolCalls?: any[]) => void,
    onError: (error: any) => void,
    abortSignal?: AbortSignal,
    onReasoning?: (reasoningChunk: string) => void
  ) {
    try {
      const systemMessages = [userSystemPrompt, appSystemPrompt]
        .map((prompt) => (prompt || '').trim())
        .filter(Boolean)
        .map((prompt) => ({ role: 'system', content: prompt }));

      const msgs = [
        ...systemMessages,
        ...messages.map(m => {
          const hasToolCalls = m.toolCalls && m.toolCalls.length > 0;
          const hasAttachments = m.attachments && m.attachments.length > 0 && m.role === 'user';

          // Build multimodal content array when attachments exist
          let content: any;
          if (hasAttachments) {
            const parts: any[] = [];
            if (m.content?.trim()) {
              parts.push({ type: 'text', text: m.content });
            }
            for (const att of m.attachments!) {
              if (att.type === 'image' && att.base64) {
                parts.push({
                  type: 'image_url',
                  image_url: { url: `data:${att.mimeType};base64,${att.base64}` },
                });
              } else if (att.type === 'file' && att.base64) {
                parts.push({
                  type: 'file',
                  file: {
                    filename: att.name,
                    file_data: `data:${att.mimeType};base64,${att.base64}`,
                  },
                });
              }
            }
            content = parts.length > 0 ? parts : (m.content || '');
          } else {
            content = hasToolCalls && m.role === 'assistant'
              ? (m.content?.trim() ? m.content : null)
              : (m.content || '');
          }

          const msg: any = { role: m.role, content };
          if (hasToolCalls) {
            msg.tool_calls = m.toolCalls!.map(tc => ({
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
      let fullReasoning = '';
      let toolCallsBuffer: any[] = [];
      const reader = (response as any).body?.getReader();

      const emitContentChunk = (contentChunk: string) => {
        if (!contentChunk) return;
        if (abortSignal?.aborted) {
          throw new Error('Request cancelled by user');
        }
        fullContent += contentChunk;
        onChunk(contentChunk, undefined);
      };

      const processDelta = (delta: any) => {
        if (!delta) return;
        // Capture reasoning/thinking content streamed separately by providers
        // (e.g. DeepSeek sends delta.reasoning_content, others may use delta.reasoning)
        const reasoningChunk = delta.reasoning_content || delta.reasoning || '';
        if (reasoningChunk && onReasoning) {
          fullReasoning += reasoningChunk;
          onReasoning(reasoningChunk);
        }
        if (delta.content) {
          emitContentChunk(delta.content);
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

      const processSsePayload = (payload: string) => {
        const cleanPayload = payload.trim();
        if (!cleanPayload || cleanPayload === '[DONE]') return;
        try {
          const json = JSON.parse(cleanPayload);
          const delta = json.choices?.[0]?.delta;
          processDelta(delta);
        } catch (e) {
          // Ignore partial or non-JSON control events.
        }
      };

      // Yield to the event loop so React can flush a render.
      const yieldToUI = () => new Promise<void>(resolve => setTimeout(resolve, 0));

      if (reader) {
        const decoder = new TextDecoder();
        let pendingBuffer = '';

        while (true) {
          if (abortSignal?.aborted) {
            throw new Error('Request cancelled by user');
          }

          let timeoutId: ReturnType<typeof setTimeout>;
          const timeoutPromise = new Promise<any>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Stream stalled (timeout)')), 60000);
          });

          let done: boolean;
          let value: any;
          try {
            ({ done, value } = await Promise.race([reader.read(), timeoutPromise]));
          } finally {
            clearTimeout(timeoutId!);
          }

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
              processSsePayload(dataLines.join('\n'));
            }
          }
          // Yield once per reader.read() so React can paint whatever was updated
          await yieldToUI();
        }

        if (pendingBuffer.trim().length > 0) {
          const dataLines = pendingBuffer
            .split('\n')
            .filter(line => line.startsWith('data:'))
            .map(line => line.replace(/^data:\s?/, ''));
          if (dataLines.length > 0) {
            processSsePayload(dataLines.join('\n'));
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
            processSsePayload(line.replace(/^data:\s?/, ''));
            // Yield per SSE event so the UI renders progressively
            await yieldToUI();
          }
        } else {
          try {
            const json = JSON.parse(text);
            const choice = json.choices?.[0];
            const message = choice?.message;
            if (message?.content) {
              emitContentChunk(message.content);
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
