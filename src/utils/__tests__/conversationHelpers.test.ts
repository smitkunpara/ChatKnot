import { generateConversationTitle, isPlaceholderTitle } from '../conversationHelpers';

describe('generateConversationTitle', () => {
    it('returns the placeholder for empty strings', () => {
        expect(generateConversationTitle('')).toBe('New Chat');
    });

    it('returns the placeholder for whitespace-only strings', () => {
        expect(generateConversationTitle('   \n\t  ')).toBe('New Chat');
    });

    it('returns short content as-is', () => {
        expect(generateConversationTitle('Hello world')).toBe('Hello world');
    });

    it('truncates long content at a word boundary', () => {
        const long = 'This is a much longer message that definitely exceeds the fifty character limit we set';
        const title = generateConversationTitle(long);
        expect(title.length).toBeLessThanOrEqual(51); // 50 chars + ellipsis
        expect(title).toMatch(/…$/);
    });

    it('collapses inline whitespace', () => {
        expect(generateConversationTitle('  hello   world  ')).toBe('hello world');
    });

    it('handles exactly 50 characters without truncation', () => {
        const exact = 'a'.repeat(50);
        expect(generateConversationTitle(exact)).toBe(exact);
    });

    it('handles unicode content', () => {
        const emoji = '🎉 Hello from ChatKnot!';
        expect(generateConversationTitle(emoji)).toBe(emoji);
    });
});

describe('isPlaceholderTitle', () => {
    it('returns true for "New Chat"', () => {
        expect(isPlaceholderTitle('New Chat')).toBe(true);
    });

    it('returns true for empty/undefined', () => {
        expect(isPlaceholderTitle('')).toBe(true);
        expect(isPlaceholderTitle(undefined)).toBe(true);
    });

    it('returns false for real titles', () => {
        expect(isPlaceholderTitle('My conversation')).toBe(false);
    });
});
