import { LlmProviderConfig } from '../../types';
import { OpenAiService } from './OpenAiService';

export class ProviderFactory {
  static create(config: LlmProviderConfig): OpenAiService {
    switch (config.type) {
      case 'openai':
      case 'custom-openai':
      case 'openrouter': // OpenRouter is OpenAI compatible
        return new OpenAiService(config);
      // Additional provider types (anthropic, gemini) can be added here when native APIs are supported.
      default:
        throw new Error(`Unsupported provider type: ${config.type}`);
    }
  }
}
