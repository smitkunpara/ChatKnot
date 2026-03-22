import {
    normalizeToolCalls,
    extractLegacyXmlToolCalls,
    extractLegacyJsonToolCalls,
    buildToolExecutionQueue,
    stripLegacyStructuredToolCalls,
    parseToolArguments,
    tryParseJsonWithRepair,
    serializeToolResult,
} from '../toolCallParsing';

// ─── normalizeToolCalls ──────────────────────────────────────

describe('normalizeToolCalls', () => {
    it('returns empty array for undefined input', () => {
        expect(normalizeToolCalls(undefined)).toEqual([]);
    });

    it('returns empty array for non-array input', () => {
        expect(normalizeToolCalls('not an array' as any)).toEqual([]);
    });

    it('normalizes a valid tool call', () => {
        const result = normalizeToolCalls([
            { id: 'tc-1', function: { name: 'get_weather', arguments: '{"city":"NYC"}' } },
        ]);
        expect(result).toEqual([
            { id: 'tc-1', name: 'get_weather', arguments: '{"city":"NYC"}' },
        ]);
    });

    it('generates an id when missing', () => {
        const result = normalizeToolCalls([
            { function: { name: 'my_tool', arguments: '{}' } },
        ]);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBeTruthy();
        expect(result[0].name).toBe('my_tool');
    });

    it('stringifies non-string arguments', () => {
        const result = normalizeToolCalls([
            { id: 'tc-2', function: { name: 'tool', arguments: { key: 'val' } } },
        ]);
        expect(result[0].arguments).toBe('{"key":"val"}');
    });

    it('defaults to empty object string when args are missing', () => {
        const result = normalizeToolCalls([
            { id: 'tc-3', function: { name: 'tool' } },
        ]);
        expect(result[0].arguments).toBe('{}');
    });

    it('drops entries without a function name', () => {
        const result = normalizeToolCalls([
            { id: 'tc-4', function: { name: '', arguments: '{}' } },
            { id: 'tc-5', function: { arguments: '{}' } },
        ]);
        expect(result).toEqual([]);
    });

    it('deduplicates by id:name', () => {
        const result = normalizeToolCalls([
            { id: 'tc-1', function: { name: 'tool', arguments: '{"a":1}' } },
            { id: 'tc-1', function: { name: 'tool', arguments: '{"a":2}' } },
        ]);
        expect(result).toHaveLength(1);
    });

    it('preserves different IDs with same name', () => {
        const result = normalizeToolCalls([
            { id: 'tc-1', function: { name: 'tool', arguments: '{"a":1}' } },
            { id: 'tc-2', function: { name: 'tool', arguments: '{"a":1}' } },
        ]);
        expect(result).toHaveLength(2);
    });
});

// ─── buildToolExecutionQueue ────────────────────────────────

describe('buildToolExecutionQueue', () => {
    it('returns all calls for unique IDs', () => {
        const calls = [
            { id: 'a', name: 'tool', arguments: '{}' },
            { id: 'b', name: 'tool', arguments: '{}' },
        ];
        expect(buildToolExecutionQueue(calls)).toEqual(calls);
    });

    it('deduplicates calls with the same ID', () => {
        const calls = [
            { id: 'a', name: 'tool', arguments: '{"x":1}' },
            { id: 'a', name: 'tool', arguments: '{"x":2}' },
        ];
        const result = buildToolExecutionQueue(calls);
        expect(result).toHaveLength(1);
        expect(result[0].arguments).toBe('{"x":1}');
    });

    it('allows same tool+args with different IDs (Q9 fix)', () => {
        const calls = [
            { id: 'call-1', name: 'poll_status', arguments: '{"endpoint":"health"}' },
            { id: 'call-2', name: 'poll_status', arguments: '{"endpoint":"health"}' },
        ];
        const result = buildToolExecutionQueue(calls);
        expect(result).toHaveLength(2);
    });

    it('returns empty array for empty input', () => {
        expect(buildToolExecutionQueue([])).toEqual([]);
    });
});

// ─── extractLegacyXmlToolCalls ──────────────────────────────

describe('extractLegacyXmlToolCalls', () => {
    const toolMap = new Map([
        ['get_weather', 'get_weather'],
        ['search', 'web_search'],
    ]);

    it('returns empty array when no XML tags present', () => {
        expect(extractLegacyXmlToolCalls('plain text', toolMap)).toEqual([]);
    });

    it('extracts a simple tool_call block', () => {
        const xml = '<tool_call><name>get_weather</name><arguments>{"city":"NYC"}</arguments></tool_call>';
        const result = extractLegacyXmlToolCalls(xml, toolMap);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('get_weather');
        expect(result[0].arguments).toBe('{"city":"NYC"}');
    });

    it('decodes XML entities in arguments', () => {
        const xml = '<tool_call><name>get_weather</name><arguments>{&quot;city&quot;:&quot;NYC&quot;}</arguments></tool_call>';
        const result = extractLegacyXmlToolCalls(xml, toolMap);
        expect(result).toHaveLength(1);
        expect(result[0].arguments).toBe('{"city":"NYC"}');
    });

    it('extracts from invoke blocks', () => {
        const xml = '<invoke><name>get_weather</name><args>{"city":"LA"}</args></invoke>';
        const result = extractLegacyXmlToolCalls(xml, toolMap);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('get_weather');
    });

    it('handles tool name attribute format', () => {
        const xml = '<tool_call name="get_weather"><arguments>{"city":"Boston"}</arguments></tool_call>';
        const result = extractLegacyXmlToolCalls(xml, toolMap);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('get_weather');
    });

    it('maps tool names via the provided map', () => {
        const xml = '<tool_call><name>search</name><arguments>{"q":"test"}</arguments></tool_call>';
        const result = extractLegacyXmlToolCalls(xml, toolMap);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('web_search');
    });

    it('ignores unknown tool names', () => {
        const xml = '<tool_call><name>unknown_tool</name><arguments>{}</arguments></tool_call>';
        const result = extractLegacyXmlToolCalls(xml, toolMap);
        expect(result).toEqual([]);
    });

    it('extracts multiple tool calls from content', () => {
        const xml = `
      <tool_call><name>get_weather</name><arguments>{"city":"NYC"}</arguments></tool_call>
      <tool_call><name>search</name><arguments>{"q":"test"}</arguments></tool_call>
    `;
        const result = extractLegacyXmlToolCalls(xml, toolMap);
        expect(result).toHaveLength(2);
    });

    it('strips code fences from arguments', () => {
        const xml = '<tool_call><name>get_weather</name><arguments>```json\n{"city":"NYC"}\n```</arguments></tool_call>';
        const result = extractLegacyXmlToolCalls(xml, toolMap);
        expect(result).toHaveLength(1);
        expect(result[0].arguments).toBe('{"city":"NYC"}');
    });
});

// ─── extractLegacyJsonToolCalls ─────────────────────────────

describe('extractLegacyJsonToolCalls', () => {
    const toolMap = new Map([
        ['get_weather', 'get_weather'],
        ['search', 'web_search'],
    ]);

    it('returns empty array for empty content', () => {
        expect(extractLegacyJsonToolCalls('', toolMap)).toEqual([]);
    });

    it('returns empty array for whitespace-only content', () => {
        expect(extractLegacyJsonToolCalls('   ', toolMap)).toEqual([]);
    });

    it('extracts a single tool call from JSON object', () => {
        const json = '{"name":"get_weather","arguments":{"city":"NYC"}}';
        const result = extractLegacyJsonToolCalls(json, toolMap);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('get_weather');
    });

    it('extracts from tool_calls array format', () => {
        const json = '{"tool_calls":[{"name":"get_weather","arguments":{"city":"LA"}}]}';
        const result = extractLegacyJsonToolCalls(json, toolMap);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('get_weather');
    });

    it('extracts from code-fenced JSON', () => {
        const content = '```json\n{"name":"get_weather","arguments":{"city":"NYC"}}\n```';
        const result = extractLegacyJsonToolCalls(content, toolMap);
        expect(result).toHaveLength(1);
    });

    it('handles function.name format', () => {
        const json = '{"function":{"name":"get_weather","arguments":{"city":"NYC"}}}';
        const result = extractLegacyJsonToolCalls(json, toolMap);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('get_weather');
    });

    it('ignores unknown tool names', () => {
        const json = '{"name":"unknown_tool","arguments":{}}';
        const result = extractLegacyJsonToolCalls(json, toolMap);
        expect(result).toEqual([]);
    });

    it('extracts from array of tool calls', () => {
        const json = '[{"name":"get_weather","arguments":{"city":"NYC"}},{"name":"search","arguments":{"q":"test"}}]';
        const result = extractLegacyJsonToolCalls(json, toolMap);
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('get_weather');
        expect(result[1].name).toBe('web_search');
    });

    it('handles string arguments', () => {
        const json = '{"name":"get_weather","arguments":"{\\"city\\":\\"NYC\\"}"}';
        const result = extractLegacyJsonToolCalls(json, toolMap);
        expect(result).toHaveLength(1);
    });
});

// ─── tryParseJsonWithRepair ─────────────────────────────────

describe('tryParseJsonWithRepair', () => {
    it('parses valid JSON', () => {
        expect(tryParseJsonWithRepair('{"a":1}')).toEqual({ a: 1 });
    });

    it('repairs single-quoted keys', () => {
        expect(tryParseJsonWithRepair("{'a': 1}")).toEqual({ a: 1 });
    });

    it('strips code fences before parsing', () => {
        expect(tryParseJsonWithRepair('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    });

    it('throws on completely invalid input', () => {
        expect(() => tryParseJsonWithRepair('not json at all')).toThrow();
    });
});

// ─── parseToolArguments ─────────────────────────────────────

describe('parseToolArguments', () => {
    it('returns empty object for empty string', () => {
        expect(parseToolArguments('', 'tool')).toEqual({});
    });

    it('parses valid JSON arguments', () => {
        expect(parseToolArguments('{"city":"NYC"}', 'tool')).toEqual({ city: 'NYC' });
    });

    it('wraps non-object parsed results', () => {
        expect(parseToolArguments('"hello"', 'tool')).toEqual({ value: 'hello' });
    });

    it('throws on invalid JSON', () => {
        expect(() => parseToolArguments('not valid json', 'tool')).toThrow(/Invalid JSON/);
    });

    it('extracts arguments from embedded XML', () => {
        const xml = '<arguments>{"city":"NYC"}</arguments>';
        expect(parseToolArguments(xml, 'tool')).toEqual({ city: 'NYC' });
    });
});

// ─── serializeToolResult ────────────────────────────────────

describe('serializeToolResult', () => {
    it('returns string values as-is', () => {
        expect(serializeToolResult('hello')).toBe('hello');
    });

    it('serializes objects to JSON', () => {
        expect(serializeToolResult({ a: 1 })).toBe('{\n  "a": 1\n}');
    });

    it('converts non-serializable values to string', () => {
        const circular: any = {};
        circular.self = circular;
        expect(serializeToolResult(circular)).toBe('[object Object]');
    });
});

// ─── stripLegacyStructuredToolCalls ────────────────────────

describe('stripLegacyStructuredToolCalls', () => {
    it('strips XML tool call blocks', () => {
        const content = 'Hello <tool_call><name>test</name></tool_call> world';
        expect(stripLegacyStructuredToolCalls(content)).toBe('Hello  world');
    });

    it('strips JSON tool call objects', () => {
        const content = '{"tool_calls":[{"name":"test","arguments":{}}]}';
        expect(stripLegacyStructuredToolCalls(content)).toBe('');
    });

    it('preserves non-tool-call text', () => {
        const content = 'This is normal text.';
        expect(stripLegacyStructuredToolCalls(content)).toBe('This is normal text.');
    });
});

// ─── Loop Detection and Legacy Parsing Edge Cases ────────────

describe('Loop Detection and Legacy Parsing Edge Cases', () => {
    it('normalizeToolCalls prevents infinite loops from identical consecutive streaming tool calls', () => {
        const repeatedCalls = [
            { id: 'loop-tc-1', function: { name: 'get_weather', arguments: '{"city":"NYC"}' } },
            { id: 'loop-tc-1', function: { name: 'get_weather', arguments: '{"city":"NYC"}' } },
            { id: 'loop-tc-1', function: { name: 'get_weather', arguments: '{"city":"NYC"}' } },
        ];
        const result = normalizeToolCalls(repeatedCalls);
        expect(result).toHaveLength(1);
    });

    it('tryParseJsonWithRepair handles deeply nested or edge-case legacy structured JSON', () => {
        // Single quotes + missing trailing braces or just weird formatting
        const strangeJson = "{'data': {'nested': ['value1', 'value2']}}";
        expect(tryParseJsonWithRepair(strangeJson)).toEqual({ data: { nested: ['value1', 'value2'] } });
    });

    it('extractLegacyJsonToolCalls handles empty or malformed input without crashing', () => {
        const toolMap = new Map([['test_tool', 'test_tool']]);
        const badInputs = ['{', '[', 'null', 'undefined', '{"name": "test_tool", "arguments": {'];
        
        for (const input of badInputs) {
            expect(() => extractLegacyJsonToolCalls(input, toolMap)).not.toThrow();
        }
    });
});
