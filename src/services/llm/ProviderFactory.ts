import { LlmProviderConfig } from '../../types';
import { OpenAiService } from './OpenAiService';

export class ProviderFactory {
  private static instanceCache = new Map<string, OpenAiService>();
  private static readonly MAX_CACHE_SIZE = 20;

  static create(config: LlmProviderConfig): OpenAiService {
    // Generate a cache key based on the provider configuration
    const cacheKey = `${config.type}:${config.baseUrl}:${config.apiKey}:${config.model}`;
if (this.instanceCache.has(cacheKey)) {
      return this.instanceCache.get(cacheKey)!;
    }

    // Evict oldest entries if cache grows too large
    if (this.instanceCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.instanceCache.keys().next().value;
      if (firstKey) this.instanceCache.delete(firstKey);
    }

    let service: OpenAiService;
    switch (config.type) {
      case 'openai':
      case 'custom-openai':
      case 'openrouter': // OpenRouter is OpenAI compatible
        service = new OpenAiService(config);
        break;
      // Additional provider types (anthropic, gemini) can be added here when native APIs are supported.
      default:
        throw new Error(`Unsupported provider type: ${config.type}`);
    }

    this.instanceCache.set(cacheKey, service);
    return service;
  }
}
