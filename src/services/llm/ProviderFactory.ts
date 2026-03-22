import { LlmProviderConfig } from '../../types';
import { OpenAiService } from './OpenAiService';

export class ProviderFactory {
  private static instanceCache = new Map<string, OpenAiService>();
  private static readonly MAX_CACHE_SIZE = 20;

  private static buildCacheKey(config: LlmProviderConfig): string {
    // Hash the API key suffix so the full secret never appears in cache keys.
    const keyTail = (config.apiKey || '').slice(-4);
    return `${config.type}:${config.baseUrl}:${keyTail}:${config.model}`;
  }

  static create(config: LlmProviderConfig): OpenAiService {
    const cacheKey = this.buildCacheKey(config);

    if (this.instanceCache.has(cacheKey)) {
      // Move to end for LRU semantics.
      const cached = this.instanceCache.get(cacheKey)!;
      this.instanceCache.delete(cacheKey);
      this.instanceCache.set(cacheKey, cached);
      return cached;
    }

    // Evict oldest entry if cache grows too large.
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
