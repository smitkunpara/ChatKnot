import type { ContextUsageData } from '../../../store/useContextUsageStore';
import {
  getPromptUsageRatio,
  getPromptUsagePercent,
  getProgressBarWidthPercent,
  getRemainingPromptTokens,
  selectContextUsageForConversation,
} from '../contextIndicatorHelpers';

const makeUsage = (patch?: Partial<ContextUsageData>): ContextUsageData => ({
  conversationId: 'conv-1',
  providerId: 'openai',
  model: 'gpt-4o',
  contextLimit: 10000,
  lastUsage: {
    promptTokens: 5000,
    completionTokens: 1000,
    totalTokens: 6000,
  },
  timestamp: 123,
  ...patch,
});

describe('ContextIndicator helpers', () => {
  describe('getPromptUsageRatio', () => {

    it('returns 0 when no usage data', () => {
      expect(getPromptUsageRatio(null)).toBe(0);
    });

    it('returns 0 when contextLimit is 0', () => {
      expect(
        getPromptUsageRatio(makeUsage({ contextLimit: 0 }))
      ).toBe(0);
    });

    it('returns 0 when contextLimit is negative', () => {
      expect(
        getPromptUsageRatio(makeUsage({ contextLimit: -1 }))
      ).toBe(0);
    });

    it('returns correct fraction for normal usage', () => {
      expect(
        getPromptUsageRatio(makeUsage({ contextLimit: 10000, lastUsage: { promptTokens: 5000, completionTokens: 100, totalTokens: 5100 } }))
      ).toBe(0.5);
    });

    it('caps at 1 when promptTokens exceed contextLimit', () => {
      expect(
        getPromptUsageRatio(makeUsage({ contextLimit: 10000, lastUsage: { promptTokens: 15000, completionTokens: 100, totalTokens: 15100 } }))
      ).toBe(1);
    });

    it('returns 0 when promptTokens is 0', () => {
      expect(
        getPromptUsageRatio(makeUsage({ contextLimit: 10000, lastUsage: { promptTokens: 0, completionTokens: 100, totalTokens: 100 } }))
      ).toBe(0);
    });

    it('returns 1 when promptTokens equals contextLimit', () => {
      expect(
        getPromptUsageRatio(makeUsage({ contextLimit: 8192, lastUsage: { promptTokens: 8192, completionTokens: 100, totalTokens: 8292 } }))
      ).toBe(1);
    });

    it('clamps negative or invalid prompt tokens to 0', () => {
      expect(
        getPromptUsageRatio(
          makeUsage({
            lastUsage: { promptTokens: -500, completionTokens: 10, totalTokens: 10 },
          })
        )
      ).toBe(0);

      expect(
        getPromptUsageRatio(
          makeUsage({
            lastUsage: { promptTokens: Number.NaN, completionTokens: 10, totalTokens: 10 },
          })
        )
      ).toBe(0);
    });
  });

  describe('percent and width helpers', () => {
    it('returns rounded usage percent', () => {
      expect(getPromptUsagePercent(makeUsage({ contextLimit: 3, lastUsage: { promptTokens: 2, completionTokens: 0, totalTokens: 2 } }))).toBe(67);
    });

    it('returns progress width in percent and caps at 100', () => {
      expect(getProgressBarWidthPercent(makeUsage({ contextLimit: 10000, lastUsage: { promptTokens: 5000, completionTokens: 0, totalTokens: 5000 } }))).toBe(50);
      expect(getProgressBarWidthPercent(makeUsage({ contextLimit: 10000, lastUsage: { promptTokens: 50000, completionTokens: 0, totalTokens: 50000 } }))).toBe(100);
    });
  });

  describe('getRemainingPromptTokens', () => {

    it('returns 0 when no data', () => {
      expect(getRemainingPromptTokens(null)).toBe(0);
    });

    it('returns contextLimit when no tokens used', () => {
      expect(getRemainingPromptTokens(makeUsage({ contextLimit: 10000, lastUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }))).toBe(10000);
    });

    it('returns 0 when all tokens used', () => {
      expect(getRemainingPromptTokens(makeUsage({ contextLimit: 10000, lastUsage: { promptTokens: 10000, completionTokens: 0, totalTokens: 10000 } }))).toBe(0);
    });

    it('returns 0 when over context (never negative)', () => {
      expect(getRemainingPromptTokens(makeUsage({ contextLimit: 10000, lastUsage: { promptTokens: 15000, completionTokens: 0, totalTokens: 15000 } }))).toBe(0);
    });

    it('returns remaining for partial usage', () => {
      expect(getRemainingPromptTokens(makeUsage({ contextLimit: 10000, lastUsage: { promptTokens: 3000, completionTokens: 0, totalTokens: 3000 } }))).toBe(7000);
    });
  });

  describe('selectContextUsageForConversation', () => {
    const entry = makeUsage();
    const usageByConversation = {
      'conv-1': entry,
    };

    it('returns data when conversation exists', () => {
      expect(selectContextUsageForConversation(usageByConversation, 'conv-1')).toEqual(entry);
    });

    it('returns null when conversation is missing', () => {
      expect(selectContextUsageForConversation(usageByConversation, 'missing')).toBeNull();
    });

    it('returns null when conversation id is null', () => {
      expect(selectContextUsageForConversation(usageByConversation, null)).toBeNull();
    });
  });
});
