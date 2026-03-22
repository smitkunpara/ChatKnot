describe('ContextIndicator component logic', () => {
  describe('fillPercent calculation', () => {
    const calcFillPercent = (
      usageData: { lastUsage: { promptTokens: number }; contextLimit: number } | null
    ): number => {
      if (!usageData || usageData.contextLimit <= 0) return 0;
      return Math.min(1, usageData.lastUsage.promptTokens / usageData.contextLimit);
    };

    it('returns 0 when no usage data', () => {
      expect(calcFillPercent(null)).toBe(0);
    });

    it('returns 0 when contextLimit is 0', () => {
      expect(
        calcFillPercent({ lastUsage: { promptTokens: 100 }, contextLimit: 0 })
      ).toBe(0);
    });

    it('returns 0 when contextLimit is negative', () => {
      expect(
        calcFillPercent({ lastUsage: { promptTokens: 100 }, contextLimit: -1 })
      ).toBe(0);
    });

    it('returns correct fraction for normal usage', () => {
      expect(
        calcFillPercent({ lastUsage: { promptTokens: 5000 }, contextLimit: 10000 })
      ).toBe(0.5);
    });

    it('caps at 1 when promptTokens exceed contextLimit', () => {
      expect(
        calcFillPercent({ lastUsage: { promptTokens: 15000 }, contextLimit: 10000 })
      ).toBe(1);
    });

    it('returns 0 when promptTokens is 0', () => {
      expect(
        calcFillPercent({ lastUsage: { promptTokens: 0 }, contextLimit: 10000 })
      ).toBe(0);
    });

    it('returns 1 when promptTokens equals contextLimit', () => {
      expect(
        calcFillPercent({ lastUsage: { promptTokens: 8192 }, contextLimit: 8192 })
      ).toBe(1);
    });
  });

  describe('fillColor thresholds', () => {
    const resolveColor = (
      fillPercent: number,
      colors: { danger: string; warning?: string; primary: string }
    ): string => {
      if (fillPercent > 0.9) return colors.danger;
      if (fillPercent > 0.7) return colors.warning ?? '#fbbf24';
      return colors.primary;
    };

    const themeColors = {
      danger: '#f87171',
      warning: '#fbbf24',
      primary: '#10b981',
    };

    it('returns primary color for fill <= 70%', () => {
      expect(resolveColor(0, themeColors)).toBe('#10b981');
      expect(resolveColor(0.5, themeColors)).toBe('#10b981');
      expect(resolveColor(0.7, themeColors)).toBe('#10b981');
    });

    it('returns warning color for fill between 70% and 90%', () => {
      expect(resolveColor(0.71, themeColors)).toBe('#fbbf24');
      expect(resolveColor(0.85, themeColors)).toBe('#fbbf24');
      expect(resolveColor(0.9, themeColors)).toBe('#fbbf24');
    });

    it('returns danger color for fill above 90%', () => {
      expect(resolveColor(0.91, themeColors)).toBe('#f87171');
      expect(resolveColor(1.0, themeColors)).toBe('#f87171');
    });

    it('falls back to default warning color when warning is undefined', () => {
      const colorsWithoutWarning = { danger: '#f87171', primary: '#10b981' };
      expect(resolveColor(0.8, colorsWithoutWarning)).toBe('#fbbf24');
    });
  });

  describe('progressBarWidth safe division', () => {
    const calcProgressWidth = (
      usageData: { lastUsage: { promptTokens: number }; contextLimit: number } | null
    ): number => {
      if (!usageData || usageData.contextLimit <= 0) return 0;
      return Math.min(100, (usageData.lastUsage.promptTokens / usageData.contextLimit) * 100);
    };

    it('returns 0 when no data', () => {
      expect(calcProgressWidth(null)).toBe(0);
    });

    it('returns 0 when contextLimit is 0', () => {
      expect(
        calcProgressWidth({ lastUsage: { promptTokens: 500 }, contextLimit: 0 })
      ).toBe(0);
    });

    it('returns 50 for half usage', () => {
      expect(
        calcProgressWidth({ lastUsage: { promptTokens: 5000 }, contextLimit: 10000 })
      ).toBe(50);
    });

    it('caps at 100 when over context', () => {
      expect(
        calcProgressWidth({ lastUsage: { promptTokens: 20000 }, contextLimit: 10000 })
      ).toBe(100);
    });
  });

  describe('remaining tokens calculation', () => {
    const calcRemaining = (
      contextLimit: number,
      promptTokens: number
    ): number => {
      return Math.max(0, contextLimit - promptTokens);
    };

    it('returns contextLimit when no tokens used', () => {
      expect(calcRemaining(10000, 0)).toBe(10000);
    });

    it('returns 0 when all tokens used', () => {
      expect(calcRemaining(10000, 10000)).toBe(0);
    });

    it('returns 0 when over context (never negative)', () => {
      expect(calcRemaining(10000, 15000)).toBe(0);
    });

    it('returns remaining for partial usage', () => {
      expect(calcRemaining(10000, 3000)).toBe(7000);
    });
  });

  describe('selector filtering', () => {
    type UsageEntry = {
      providerId: string;
      model: string;
    };

    const selectUsage = (
      data: UsageEntry | undefined,
      providerId: string,
      model: string
    ): UsageEntry | null => {
      if (!data) return null;
      if (data.providerId !== providerId || data.model !== model) return null;
      return data;
    };

    it('returns data when provider and model match', () => {
      const entry = { providerId: 'openai', model: 'gpt-4o' };
      expect(selectUsage(entry, 'openai', 'gpt-4o')).toEqual(entry);
    });

    it('returns null when provider mismatches', () => {
      const entry = { providerId: 'openai', model: 'gpt-4o' };
      expect(selectUsage(entry, 'anthropic', 'gpt-4o')).toBeNull();
    });

    it('returns null when model mismatches', () => {
      const entry = { providerId: 'openai', model: 'gpt-4o' };
      expect(selectUsage(entry, 'openai', 'gpt-3.5-turbo')).toBeNull();
    });

    it('returns null when data is undefined', () => {
      expect(selectUsage(undefined, 'openai', 'gpt-4o')).toBeNull();
    });
  });
});
