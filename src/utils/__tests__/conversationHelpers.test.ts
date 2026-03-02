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
        expect(title).toBe('This is a much longer message that definitely…');
    });

    it('cuts at the last space even if it is near the beginning (B5 fix)', () => {
        // Space at pos 5, total length > 50
        const str = 'Short ' + 'a'.repeat(50);
        const title = generateConversationTitle(str);
        // It should cut at the space ("Short"), not at 50 chars mid-word
        expect(title).toBe('Short…');
    });

    it('cuts at MAX_TITLE_LENGTH if there are absolutely no spaces', () => {
        const exact = 'a'.repeat(60);
        const title = generateConversationTitle(exact);
        expect(title).toBe('a'.repeat(50) + '…');
    });

    it('cuts exactly at MAX_TITLE_LENGTH if the space is exactly there', () => {
        // Space at index 50
        const str = 'a'.repeat(50) + ' ' + 'b'.repeat(10);
        const title = generateConversationTitle(str);
        expect(title).toBe('a'.repeat(50) + '…');
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
