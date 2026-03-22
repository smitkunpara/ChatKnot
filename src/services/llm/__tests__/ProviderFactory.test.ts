import { ProviderFactory } from '../ProviderFactory';
import { LlmProviderConfig } from '../../../types';

const createProviderConfig = (overrides: Partial<LlmProviderConfig> = {}): LlmProviderConfig => ({
  id: 'provider-1',
  name: 'Provider One',
  type: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'test-key',
  model: 'gpt-4o-mini',
  enabled: true,
  ...overrides,
});

const buildCacheKey = (config: LlmProviderConfig): string => {
  const keyTail = (config.apiKey || '').slice(-4);
  return `${config.type}:${config.baseUrl}:${keyTail}:${config.model}`;
};

describe('ProviderFactory', () => {
  beforeEach(() => {
    (ProviderFactory as any).instanceCache.clear();
  });

  describe('cache key generation', () => {
    it('generates unique cache keys for different provider configurations', () => {
      const config1 = createProviderConfig({ model: 'gpt-4o' });
      const config2 = createProviderConfig({ model: 'gpt-4o-mini' });

      const service1 = ProviderFactory.create(config1);
      const service2 = ProviderFactory.create(config2);

      expect(service1).not.toBe(service2);
    });

    it('generates same key for identical configurations', () => {
      const config1 = createProviderConfig();
      const config2 = createProviderConfig();

      const service1 = ProviderFactory.create(config1);
      const service2 = ProviderFactory.create(config2);

      expect(service1).toBe(service2);
    });

    it('differentiates by baseUrl', () => {
      const config1 = createProviderConfig({ baseUrl: 'https://api.openai.com/v1' });
      const config2 = createProviderConfig({ baseUrl: 'https://api.custom.com/v1' });

      const service1 = ProviderFactory.create(config1);
      const service2 = ProviderFactory.create(config2);

      expect(service1).not.toBe(service2);
    });

    it('differentiates by apiKey suffix', () => {
      const config1 = createProviderConfig({ apiKey: 'sk-key-aaaa' });
      const config2 = createProviderConfig({ apiKey: 'sk-key-bbbb' });

      const service1 = ProviderFactory.create(config1);
      const service2 = ProviderFactory.create(config2);

      expect(service1).not.toBe(service2);
    });

    it('treats keys with same last 4 chars as same cache entry', () => {
      const config1 = createProviderConfig({ apiKey: 'sk-aaaa' });
      const config2 = createProviderConfig({ apiKey: 'xx-aaaa' });

      const service1 = ProviderFactory.create(config1);
      const service2 = ProviderFactory.create(config2);

      expect(service1).toBe(service2);
    });

    it('differentiates by provider type', () => {
      const config1 = createProviderConfig({ type: 'openai' });
      const config2 = createProviderConfig({ type: 'openrouter' });

      const service1 = ProviderFactory.create(config1);
      const service2 = ProviderFactory.create(config2);

      expect(service1).not.toBe(service2);
    });

    it('does not include full API key in cache key', () => {
      const secret = 'sk-super-secret-api-key-1234567890';
      const config = createProviderConfig({ apiKey: secret });
      ProviderFactory.create(config);

      const cache = (ProviderFactory as any).instanceCache as Map<string, unknown>;
      for (const key of cache.keys()) {
        expect(key).not.toContain(secret);
        expect(key).toContain('7890');
      }
    });
  });

  describe('cache hit/miss', () => {
    it('returns cached instance on subsequent calls with same config', () => {
      const config = createProviderConfig();

      const service1 = ProviderFactory.create(config);
      const service2 = ProviderFactory.create(config);

      expect(service1).toBe(service2);
    });

    it('creates new instance when config differs', () => {
      const config1 = createProviderConfig({ model: 'gpt-4o' });
      const config2 = createProviderConfig({ model: 'gpt-4o-mini' });

      const service1 = ProviderFactory.create(config1);
      const service2 = ProviderFactory.create(config2);

      expect(service1).not.toBe(service2);
    });

    it('maintains multiple cached instances simultaneously', () => {
      const config1 = createProviderConfig({ id: 'p1', model: 'gpt-4o' });
      const config2 = createProviderConfig({ id: 'p2', model: 'gpt-4o-mini' });
      const config3 = createProviderConfig({ id: 'p3', model: 'gpt-3.5-turbo' });

      const service1 = ProviderFactory.create(config1);
      const service2 = ProviderFactory.create(config2);
      const service3 = ProviderFactory.create(config3);

      expect(ProviderFactory.create(config1)).toBe(service1);
      expect(ProviderFactory.create(config2)).toBe(service2);
      expect(ProviderFactory.create(config3)).toBe(service3);
    });

    it('refreshes LRU position on cache hit', () => {
      for (let i = 0; i < 20; i++) {
        ProviderFactory.create(createProviderConfig({ id: `p-${i}`, model: `m-${i}` }));
      }

      const firstConfig = createProviderConfig({ id: 'p-0', model: 'm-0' });
      ProviderFactory.create(firstConfig);

      ProviderFactory.create(createProviderConfig({ id: 'p-new', model: 'm-new' }));

      const cache = (ProviderFactory as any).instanceCache as Map<string, unknown>;
      expect(cache.has(buildCacheKey(firstConfig))).toBe(true);
      const evictedConfig = createProviderConfig({ id: 'p-1', model: 'm-1' });
      expect(cache.has(buildCacheKey(evictedConfig))).toBe(false);
    });
  });

  describe('MAX_CACHE_SIZE eviction', () => {
    it('evicts oldest entry when cache reaches MAX_CACHE_SIZE', () => {
      for (let i = 0; i < 20; i++) {
        const config = createProviderConfig({ id: `provider-${i}`, model: `model-${i}` });
        ProviderFactory.create(config);
      }

      const cache = (ProviderFactory as any).instanceCache;
      expect(cache.size).toBe(20);

      const config21 = createProviderConfig({ id: 'provider-21', model: 'model-21' });
      ProviderFactory.create(config21);

      expect(cache.size).toBe(20);
      expect(cache.has(buildCacheKey(config21))).toBe(true);

      const firstConfig = createProviderConfig({ id: 'provider-0', model: 'model-0' });
      expect(cache.has(buildCacheKey(firstConfig))).toBe(false);
    });

    it('evicts one entry at a time when limit exceeded', () => {
      for (let i = 0; i < 20; i++) {
        const config = createProviderConfig({ id: `provider-${i}`, model: `model-${i}` });
        ProviderFactory.create(config);
      }

      for (let i = 20; i < 25; i++) {
        const config = createProviderConfig({ id: `provider-${i}`, model: `model-${i}` });
        ProviderFactory.create(config);
      }

      const cache = (ProviderFactory as any).instanceCache;
      expect(cache.size).toBe(20);
    });
  });

  describe('unsupported provider type', () => {
    it('throws error for unsupported provider type', () => {
      const config = createProviderConfig({ type: 'anthropic' as any });

      expect(() => ProviderFactory.create(config)).toThrow('Unsupported provider type: anthropic');
    });

    it('supports custom-openai type', () => {
      const config = createProviderConfig({ type: 'custom-openai' });

      expect(() => ProviderFactory.create(config)).not.toThrow();
    });

    it('supports openrouter type', () => {
      const config = createProviderConfig({ type: 'openrouter' });

      expect(() => ProviderFactory.create(config)).not.toThrow();
    });
  });
});
