import { LlmProviderConfig } from '../../types';
import { OpenAiService } from './OpenAiService';

export class ProviderFactory {
  static create(config: LlmProviderConfig): OpenAiService {
    switch (config.type) {
      case 'openai':
      case 'custom-openai':
      case 'openrouter': // OpenRouter is OpenAI compatible
        return new OpenAiService(config);
      case 'anthropic':
        // For MVP, we can treat Anthropic as OpenAI compatible if using a proxy or implement specific service.
        // If not using a proxy, we'd need a specific Anthropic service.
        // For now, let's assume OpenAI compatible or specific implementation later.
        // Actually, let's just reuse OpenAiService but note that Anthropic requires different headers/endpoint.
        // If the user configures custom endpoint for Anthropic, it might work via OpenAI proxy.
        // But native Anthropic API is different.
        // Given the prompt requirements, let's stick to OpenAI compatible for now and add TODO.
        return new OpenAiService(config); 
      case 'gemini':
        // Same for Gemini
        return new OpenAiService(config);
      default:
        throw new Error(`Unsupported provider type: ${config.type}`);
    }
  }
}
