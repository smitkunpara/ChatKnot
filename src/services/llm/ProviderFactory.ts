import { LlmProviderConfig } from '../../types';
import { OpenAiService } from './OpenAiService';

export class ProviderFactory {
  private static instanceCache = new Map<string, OpenAiService>();
  private static readonly MAX_CACHE_SIZE = 20;

  private static hashKeyMaterial(input: string): string {
    // Lightweight stable hash to avoid embedding raw secrets in cache keys.
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  private static buildCacheKey(config: LlmProviderConfig): string {
    const baseUrl = (config.baseUrl || '').trim().toLowerCase();
    const trimmedApiKey = (config.apiKey || '').trim();
    const trimmedApiKeyRef = (config.apiKeyRef || '').trim();
    const keyMaterial = trimmedApiKey || trimmedApiKeyRef;
    const keyFingerprint = keyMaterial
      ? this.hashKeyMaterial(keyMaterial)
      : '';
    return `${config.type}:${baseUrl}:${keyFingerprint}:${config.model}`;
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
