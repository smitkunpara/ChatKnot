const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // OpenAI GPT-4o family
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4o-2024-08-06': 128000,
  'gpt-4o-2024-11-20': 128000,
  'gpt-4o-mini-2024-07-18': 128000,

  // OpenAI GPT-4 Turbo
  'gpt-4-turbo': 128000,
  'gpt-4-turbo-2024-04-09': 128000,
  'gpt-4-turbo-preview': 128000,
  'gpt-4-0125-preview': 128000,
  'gpt-4-1106-preview': 128000,

  // OpenAI GPT-4
  'gpt-4': 8192,
  'gpt-4-0613': 8192,
  'gpt-4-32k': 32768,

  // OpenAI GPT-3.5
  'gpt-3.5-turbo': 16385,
  'gpt-3.5-turbo-0125': 16385,
  'gpt-3.5-turbo-1106': 16385,

  // OpenAI o1 family
  'o1': 200000,
  'o1-mini': 128000,
  'o1-preview': 128000,
  'o3-mini': 200000,

  // Anthropic Claude
  'claude-3-5-sonnet': 200000,
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-5-sonnet-20240620': 200000,
  'claude-3-5-haiku': 200000,
  'claude-3-5-haiku-20241022': 200000,
  'claude-3-opus': 200000,
  'claude-3-opus-20240229': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-sonnet-20240229': 200000,
  'claude-3-haiku': 200000,
  'claude-3-haiku-20240307': 200000,
  'claude-sonnet-4-20250514': 200000,

  // DeepSeek
  'deepseek-chat': 128000,
  'deepseek-coder': 128000,
  'deepseek-reasoner': 128000,
  'deepseek-r1': 128000,

  // Google Gemini
  'gemini-1.5-pro': 2097152,
  'gemini-1.5-flash': 1048576,
  'gemini-2.0-flash': 1048576,
  'gemini-2.0-flash-lite': 1048576,
  'gemini-2.0-pro': 2097152,

  // Mistral
  'mistral-large-latest': 128000,
  'mistral-medium-latest': 32000,
  'mistral-small-latest': 32000,
  'mistral-tiny': 32000,
  'open-mixtral-8x7b': 32000,
  'open-mixtral-8x22b': 64000,

  // Meta Llama
  'llama-3.1-405b': 131072,
  'llama-3.1-70b': 131072,
  'llama-3.1-8b': 131072,
  'llama-3.2-90b': 131072,
  'llama-3.2-11b': 131072,
  'llama-3.2-3b': 131072,
  'llama-3.2-1b': 131072,
  'llama-3.3-70b': 131072,

  // Qwen
  'qwen-2.5-72b': 131072,
  'qwen-2.5-32b': 131072,
  'qwen-2.5-14b': 131072,
  'qwen-2.5-7b': 131072,
  'qwen-2.5-coder-32b': 131072,
  'qwen-qwq-32b': 131072,
  'qwen-max': 32768,
  'qwen-plus': 131072,
  'qwen-turbo': 1000000,

  // Cohere
  'command-r-plus': 128000,
  'command-r': 128000,
};

const DEFAULT_CONTEXT_LIMIT = 128000;

export const getContextLimitForModel = (model: string): number => {
  if (!model) return DEFAULT_CONTEXT_LIMIT;

  const normalizedModel = model.toLowerCase().trim();

  // Direct match
  if (MODEL_CONTEXT_LIMITS[normalizedModel]) {
    return MODEL_CONTEXT_LIMITS[normalizedModel];
  }

  // Prefix match - try matching from most specific to least
  const sortedKeys = Object.keys(MODEL_CONTEXT_LIMITS).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (normalizedModel.startsWith(key) || normalizedModel.includes(key)) {
      return MODEL_CONTEXT_LIMITS[key];
    }
  }

  // Try matching by model family patterns
  if (normalizedModel.includes('gpt-4o')) return 128000;
  if (normalizedModel.includes('gpt-4')) return 128000;
  if (normalizedModel.includes('gpt-3.5')) return 16385;
  if (normalizedModel.includes('claude')) return 200000;
  if (normalizedModel.includes('gemini')) return 1048576;
  if (normalizedModel.includes('deepseek')) return 128000;
  if (normalizedModel.includes('llama')) return 131072;
  if (normalizedModel.includes('mistral') || normalizedModel.includes('mixtral')) return 32000;
  if (normalizedModel.includes('qwen')) return 131072;
  if (normalizedModel.includes('command-r')) return 128000;

  return DEFAULT_CONTEXT_LIMIT;
};

export const formatTokenCount = (count: number): string => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
};
