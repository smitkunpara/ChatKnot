export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
}

export interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  timestamp: number;
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
  type: 'custom-openai';
  baseUrl: string;
  apiKey: string;
  apiKeyRef?: string;
  model: string;
  availableModels?: string[]; // Added to store fetched models
  hiddenModels?: string[];
  enabled: boolean;
}

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema: any;
}

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
}

export interface AppSettings {
  providers: LlmProviderConfig[];
  mcpServers: McpServerConfig[];
  systemPrompt: string;
  theme: 'light' | 'dark' | 'system';
  lastUsedModel: LastUsedModelPreference | null;
}
