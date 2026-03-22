import { LlmProviderConfig, Message, ModelCapabilities } from '../../types';
import { filterModelsForTextOutput } from './modelFilter';

import { DEFAULT_OPENAI_BASE_URL } from '../../constants/api';

export interface ModelsWithCapabilities {
  models: string[];
  capabilities: Record<string, ModelCapabilities>;
}

type ToolFunction = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

type ToolSchema = {
  type: string;
  function: ToolFunction;
};

interface StreamToolCallDelta {
  index?: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string | Record<string, unknown>;
  };
}

interface StreamDelta {
  content?: string;
  reasoning_content?: string;
  reasoning?: string;
  tool_calls?: StreamToolCallDelta[];
  function_call?: {
    name?: string;
    arguments?: string;
  };
}

interface StreamMessage {
  content?: string;
  reasoning_content?: string;
  reasoning?: string;
  tool_calls?: StreamToolCallDelta[];
  function_call?: {
    name?: string;
    arguments?: string;
  };
}

interface StreamChoice {
  delta?: StreamDelta;
  message?: StreamMessage;
}

interface StreamChunk {
  choices?: StreamChoice[];
  message?: StreamMessage;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface MergedToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
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
      // Re-throw typed errors; re-throw unknown errors as well so we never
      // silently return an unvalidated URL.
      throw error instanceof Error ? error : new Error(String(error));
    }

    return finalBaseUrl;
  }

  private getHeaders(): Record<string, string> {
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

  private async fetchModelsPayload(): Promise<unknown> {
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

          const responseText = await response.text().catch(() => '');
          const compactBody = responseText.replace(/\s+/g, ' ').trim();
          const bodyPreview = compactBody ? `: ${compactBody.slice(0, 180)}` : '';
          throw new Error(`Failed to fetch models from ${endpoint} (${statusLabel})${bodyPreview}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

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

  private static getNestedValue(source: unknown, path: string[]): unknown {
    return path.reduce<unknown>((value, key) => {
      if (value == null || typeof value !== 'object') {
        return undefined;
      }
      return (value as Record<string, unknown>)[key];
    }, source);
  }

  private static toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
      .filter(Boolean);
  }

  private static parseBoolean(value: unknown): boolean | undefined {
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

  private static getBooleanAtPaths(source: unknown, paths: string[][]): boolean | undefined {
    for (const path of paths) {
      const parsed = OpenAiService.parseBoolean(OpenAiService.getNestedValue(source, path));
      if (parsed !== undefined) {
        return parsed;
      }
    }
    return undefined;
  }

  private static collectTokens(source: unknown, paths: string[][]): Set<string> {
    const tokens = new Set<string>();
    for (const path of paths) {
      const value = OpenAiService.getNestedValue(source, path);
      for (const token of OpenAiService.toStringArray(value)) {
        tokens.add(token);
      }
    }
    return tokens;
  }

  private static extractModelList(data: unknown): unknown[] {
    const obj = data as Record<string, unknown> | null;
    if (Array.isArray(obj?.data)) return obj.data as unknown[];
    if (Array.isArray(obj?.models)) return obj.models as unknown[];
    const result = (obj as Record<string, unknown>)?.result as Record<string, unknown> | undefined;
    if (Array.isArray(result?.data)) return result.data as unknown[];
    if (Array.isArray(data)) return data as unknown[];
    return [];
  }

  private static hasAnyToken(tokens: Set<string>, matches: string[]): boolean {
    for (const token of tokens) {
      for (const match of matches) {
        if (token === match || token.includes(match)) {
          return true;
        }
      }
    }
    return false;
  }

  private static extractCapabilities(model: unknown): ModelCapabilities | null {
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

    const toolTokens = new Set<string>([...parameterTokens, ...featureTokens]);

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

  async listModelsWithCapabilities(): Promise<ModelsWithCapabilities> {
    try {
      const data = await this.fetchModelsPayload();
      const rawModels = OpenAiService.extractModelList(data);
      const supportedModels = filterModelsForTextOutput(rawModels);

      const capabilities: Record<string, ModelCapabilities> = {};
      for (const model of rawModels) {
        const id = typeof model === 'string' ? model : (model as Record<string, unknown>)?.id as string || (model as Record<string, unknown>)?.name as string || '';
        if (id && supportedModels.includes(id)) {
          const caps = OpenAiService.extractCapabilities(model);
          if (caps) {
            capabilities[id] = caps;
          }
        }
      }

      return { models: supportedModels, capabilities };
    } catch (error) {
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
    tools: ToolSchema[],
    onChunk: (content: string, toolCalls?: MergedToolCall[]) => void,
    onComplete: (fullContent: string, fullToolCalls?: MergedToolCall[]) => void,
    onError: (error: unknown) => void,
    abortSignal?: AbortSignal,
    onReasoning?: (reasoningChunk: string) => void,
    onUsage?: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void
  ) {
    try {
      const systemMessages = [userSystemPrompt, appSystemPrompt]
        .map((prompt) => (prompt || '').trim())
        .filter(Boolean)
        .map((prompt) => ({ role: 'system' as const, content: prompt }));

      type ContentPart =
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
        | { type: 'file'; file: { filename: string; file_data: string } };

      const msgs = [
        ...systemMessages,
        ...messages.map(m => {
          const hasToolCalls = m.toolCalls && m.toolCalls.length > 0;
          const hasAttachments = m.attachments && m.attachments.length > 0 && m.role === 'user';

          let content: string | ContentPart[] | null;
          if (hasAttachments) {
            const parts: ContentPart[] = [];
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

          const msg: Record<string, unknown> = { role: m.role, content };
          if (hasToolCalls) {
            msg.tool_calls = m.toolCalls!.map(tc => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: tc.arguments,
              },
            }));
          }
          if (m.role === 'tool') {
            msg.tool_call_id = m.toolCallId;
          }
          return msg;
        }),
      ];

      const body: Record<string, unknown> = {
        model: this.config.model,
        messages: msgs,
        stream: true,
      };

      if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
        body.parallel_tool_calls = true;

        // Compatibility fallback for OpenAI-like providers that still expect the
        // legacy function-calling shape. This used to be present and some
        // third-party/OpenRouter-backed models behave better with it.
        const isLikelyOpenAi = /api\.openai\.com/i.test(this.getBaseUrl());
        if (!isLikelyOpenAi) {
          body.functions = tools.map((tool) => tool.function);
          body.function_call = 'auto';
        }
      }

      const fetchOptions: RequestInit & Record<string, unknown> = {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: abortSignal,
        reactNative: { textStreaming: true },
      };

      const response = await fetch(`${this.getBaseUrl()}/chat/completions`, fetchOptions);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API Error: ${response.status} - ${text}`);
      }

      const mergeToolCalls = (current: MergedToolCall[], newCalls: StreamToolCallDelta[]): MergedToolCall[] => {
        if (!newCalls) return current;
        const result: MergedToolCall[] = [...current];
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

          // Fill sparse array holes so downstream iteration never hits undefined.
          while (result.length <= index) {
            result.push({
              id: `pending_${result.length}`,
              type: 'function',
              function: { name: '', arguments: '' },
            });
          }

          const argsChunk =
            typeof call.function?.arguments === 'string'
              ? call.function.arguments
              : call.function?.arguments
                ? JSON.stringify(call.function.arguments)
                : '';

          if (!result[index].function.name && !result[index].function.arguments) {
            // First chunk for this slot — overwrite placeholders.
            result[index] = {
              id: call.id || result[index].id,
              type: call.type || 'function',
              function: {
                name: call.function?.name || '',
                arguments: argsChunk,
              },
            };
          } else {
            // Accumulate streamed arguments.
            if (argsChunk) result[index].function.arguments += argsChunk;
            if (call.function?.name) result[index].function.name = call.function.name;
            if (call.id) result[index].id = call.id;
          }
        });
        return result;
      };

      let fullContent = '';
      let fullReasoning = '';
      let toolCallsBuffer: MergedToolCall[] = [];
      const responseWithBody = response as Response & { body?: { getReader(): ReadableStreamDefaultReader<Uint8Array> } };
      const reader = responseWithBody.body?.getReader();

      const emitContentChunk = (contentChunk: string) => {
        if (!contentChunk) return;
        if (abortSignal?.aborted) {
          throw new Error('Request cancelled by user');
        }
        fullContent += contentChunk;
        onChunk(contentChunk, undefined);
      };

      const processDelta = (delta: StreamDelta | undefined): boolean => {
        if (!delta) return false;
        let emitted = false;

        const reasoningChunk = delta.reasoning_content || delta.reasoning || '';
        if (reasoningChunk && onReasoning) {
          fullReasoning += reasoningChunk;
          onReasoning(reasoningChunk);
          emitted = true;
        }

        if (delta.content) {
          emitContentChunk(delta.content);
          emitted = true;
        }

        if (delta.tool_calls) {
          toolCallsBuffer = mergeToolCalls(toolCallsBuffer, delta.tool_calls);
          onChunk('', toolCallsBuffer);
          emitted = true;
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
          emitted = true;
        }

        return emitted;
      };

      const processMessageFields = (message: StreamMessage | undefined): boolean => {
        if (!message) return false;
        let emitted = false;

        const reasoningChunk = message.reasoning_content || message.reasoning || '';
        if (reasoningChunk && onReasoning) {
          fullReasoning += reasoningChunk;
          onReasoning(reasoningChunk);
          emitted = true;
        }

        if (message.content) {
          emitContentChunk(message.content);
          emitted = true;
        }

        if (message.tool_calls) {
          toolCallsBuffer = mergeToolCalls(toolCallsBuffer, message.tool_calls);
          onChunk('', toolCallsBuffer);
          emitted = true;
        }

        if (message.function_call) {
          toolCallsBuffer = mergeToolCalls(toolCallsBuffer, [
            {
              index: 0,
              id: toolCallsBuffer[0]?.id || 'legacy_function_call_0',
              type: 'function',
              function: {
                name: message.function_call.name,
                arguments: message.function_call.arguments || '',
              },
            },
          ]);
          onChunk('', toolCallsBuffer);
          emitted = true;
        }

        return emitted;
      };

      const processSsePayload = (payload: string): boolean => {
        const cleanPayload = payload.trim();
        if (!cleanPayload || cleanPayload === '[DONE]') return false;
        try {
          const json: StreamChunk = JSON.parse(cleanPayload);

          // Capture token usage from the API response
          if (json.usage && onUsage) {
            const usage = json.usage;
            onUsage({
              promptTokens: usage.prompt_tokens ?? 0,
              completionTokens: usage.completion_tokens ?? 0,
              totalTokens: usage.total_tokens ?? 0,
            });
          }

          const choice = json.choices?.[0];
          const delta = choice?.delta;
          const message = choice?.message ?? json.message;

          if (processDelta(delta)) {
            return true;
          }

          return processMessageFields(message);
        } catch {
          // Ignore partial or non-JSON control events.
          return false;
        }
      };

      const splitSseEvents = (buffer: string): { events: string[]; pending: string } => {
        const events: string[] = [];
        let remaining = buffer;

        while (true) {
          const boundaryMatch = remaining.match(/\r?\n\r?\n/);
          if (!boundaryMatch || boundaryMatch.index === undefined) {
            break;
          }

          const boundaryIndex = boundaryMatch.index;
          events.push(remaining.slice(0, boundaryIndex));
          remaining = remaining.slice(boundaryIndex + boundaryMatch[0].length);
        }

        return { events, pending: remaining };
      };

      const extractSsePayload = (event: string): string | null => {
        const dataLines = event
          .split(/\r?\n/)
          .map((line) => line.trimEnd())
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s?/, ''));

        if (dataLines.length === 0) {
          return null;
        }

        return dataLines.join('\n');
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
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Stream stalled (timeout)')), 60000);
          });

          let done: boolean;
          let value: Uint8Array | undefined;
          try {
            ({ done, value } = await Promise.race([reader.read(), timeoutPromise]));
          } catch (readError: unknown) {
            // Explicitly cancel the reader to properly terminate the stream
            // before handling the abort error. This prevents unhandled promise
            // rejections that can crash the app when aborting mid-stream.
            try {
              await reader.cancel();
            } catch {
              // Ignore cancel errors - the reader may already be cancelled
            }
            const errorName = readError instanceof Error ? readError.name : '';
            if (errorName === 'AbortError' || abortSignal?.aborted) {
              throw new Error('Request cancelled by user');
            }
            throw readError;
          } finally {
            clearTimeout(timeoutId!);
          }

          if (done) break;
          pendingBuffer += decoder.decode(value, { stream: true });
          const { events, pending } = splitSseEvents(pendingBuffer);
          pendingBuffer = pending;

          for (const event of events) {
            const payload = extractSsePayload(event);
            if (!payload) {
              continue;
            }

            const emitted = processSsePayload(payload);
            if (emitted) {
              // Yield for each payload so batched network chunks still render progressively.
              await yieldToUI();
            }
          }
        }

        pendingBuffer += decoder.decode();

        // Final yield to ensure UI catches up
        await yieldToUI();

        if (pendingBuffer.trim().length > 0) {
          const payload = extractSsePayload(pendingBuffer);
          if (payload) {
            const emitted = processSsePayload(payload);
            if (emitted) {
              await yieldToUI();
            }
          }
        }
        onComplete(fullContent, toolCallsBuffer.length > 0 ? toolCallsBuffer : undefined);
      } else {
        // Fallback for non-streaming reader (manual processing of the full body)
        const text = await response.text();
        const { events, pending } = splitSseEvents(text);
        const sseEvents = pending.trim().length > 0 ? [...events, pending] : events;

        if (sseEvents.length > 0) {
          for (const event of sseEvents) {
            const payload = extractSsePayload(event);
            if (!payload) {
              continue;
            }

            const emitted = processSsePayload(payload);
            if (emitted) {
              // Yield per SSE payload so UI keeps up with each chunk.
              await yieldToUI();
            }
          }
          await yieldToUI();
        } else {
          try {
            const json: StreamChunk = JSON.parse(text);
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
          } catch {
            throw new Error('Unable to parse model response');
          }
        }
        onComplete(fullContent, toolCallsBuffer.length > 0 ? toolCallsBuffer : undefined);
      }
    } catch (error) {
      const abortError = error as Error & { name?: string };
      if (abortError?.name === 'AbortError') {
        onError(new Error('Request cancelled by user'));
        return;
      }
      onError(error);
    }
  }
}
