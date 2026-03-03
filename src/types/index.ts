export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
}

export interface ModelCapabilities {
  vision: boolean;
  tools: boolean;
  fileInput: boolean;
}

export interface Attachment {
  id: string;
  type: 'image' | 'file';
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  base64?: string;
}

export interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  timestamp: number;
  attachments?: Attachment[];
  isError?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  providerId: string;
  modelOverride?: string;
  systemPrompt: string;
  createdAt?: number;
  updatedAt: number;
}

export interface LastUsedModelPreference {
  providerId: string;
  model: string;
}

export interface LlmProviderConfig {
  id: string;
  name: string;
  type: 'openai' | 'custom-openai' | 'openrouter';
  baseUrl: string;
  apiKey: string;
  apiKeyRef?: string;
  model: string;
  availableModels?: string[];
  modelCapabilities?: Record<string, ModelCapabilities>;
  hiddenModels?: string[];
  enabled: boolean;
}

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema: any;
}

export type OpenApiValidationField = 'url' | 'headers' | 'spec' | 'network';

export type OpenApiValidationErrorCode =
  | 'URL_REQUIRED'
  | 'URL_INVALID'
  | 'FETCH_FAILED'
  | 'HTTP_STATUS'
  | 'INVALID_JSON'
  | 'INVALID_SPEC'
  | 'NO_OPERATIONS';

export interface OpenApiValidationError {
  code: OpenApiValidationErrorCode;
  field: OpenApiValidationField;
  message: string;
  details?: {
    attemptedUrls?: string[];
    status?: number;
    statusText?: string;
    missingFields?: string[];
  };
}

export interface OpenApiValidationSuccess {
  ok: true;
  normalizedInputUrl: string;
  resolvedSpecUrl: string;
  resolvedBaseUrl: string;
  spec: any;
  tools: McpToolSchema[];
}

export interface OpenApiValidationFailure {
  ok: false;
  error: OpenApiValidationError;
}

export type OpenApiValidationResult = OpenApiValidationSuccess | OpenApiValidationFailure;

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  token?: string;
  tokenRef?: string;
  headers?: Record<string, string>;
  headerRefs?: Record<string, string>;
  enabled: boolean;
  tools: McpToolSchema[];
  autoAllow: boolean;
  allowedTools: string[];
  autoApprovedTools?: string[];
}

export interface Mode {
  id: string;
  name: string;
  systemPrompt: string;
  providerId: string | null;
  model: string | null;
  mcpServers: McpServerConfig[];
  isDefault: boolean;
}

export interface AppSettings {
  providers: LlmProviderConfig[];
  modes: Mode[];
  lastUsedModeId: string | null;
  theme: 'light' | 'dark' | 'system';
  lastUsedModel: LastUsedModelPreference | null;
}
