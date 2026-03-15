import uuid from 'react-native-uuid';

export const normalizeToolCalls = (toolCalls: any[] | undefined): Array<{ id: string; name: string; arguments: string }> => {
  if (!Array.isArray(toolCalls)) return [];

  const normalized = toolCalls
    .map(call => {
      const rawArgs = call?.function?.arguments;
      return {
        id: (call?.id || uuid.v4()) as string,
        name: call?.function?.name || '',
        arguments:
          typeof rawArgs === 'string'
            ? rawArgs
            : rawArgs
              ? JSON.stringify(rawArgs)
              : '{}',
      };
    })
    .filter(call => call.name);

  // Some providers duplicate tool calls in streamed chunks. Keep order, drop duplicates.
  const seen = new Set<string>();
  return normalized.filter(call => {
    const key = `${call.id}:${call.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const decodeXmlEntities = (value: string): string =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const stripCodeFence = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/```$/, '').trim();
};

const extractFirstJsonObject = (value: string): string | null => {
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return value.slice(start, end + 1);
};

const getXmlTagValue = (block: string, tagNames: string[]): string | null => {
  for (const tag of tagNames) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = block.match(regex);
    if (match?.[1]) {
      return decodeXmlEntities(match[1].trim());
    }
  }
  return null;
};

const getXmlToolName = (block: string): string | null => {
  const fromTag = getXmlTagValue(block, ['name', 'tool', 'tool_name', 'function', 'function_name']);
  if (fromTag) return fromTag;
  const attrMatch = block.match(/<(tool_call|tool|call|invoke)[^>]*\b(?:name|tool|function)=["']([^"']+)["']/i);
  return attrMatch?.[2]?.trim() || null;
};

export const extractLegacyXmlToolCalls = (
  content: string,
  toolNameMap: Map<string, string>
): Array<{ id: string; name: string; arguments: string }> => {
  if (!content.includes('<')) return [];

  const blocks: string[] = [];
  const blockPatterns = [
    /<tool_call[\s\S]*?<\/tool_call>/gi,
    /<function_call[\s\S]*?<\/function_call>/gi,
    /<invoke[\s\S]*?<\/invoke>/gi,
    /<tool[\s\S]*?<\/tool>/gi,
    /<call[\s\S]*?<\/call>/gi,
  ];

  for (const pattern of blockPatterns) {
    const matches = content.match(pattern);
    if (matches?.length) {
      blocks.push(...matches);
    }
  }

  const deduped = Array.from(new Set(blocks));
  return deduped
    .map((block) => {
      const name = getXmlToolName(block);
      if (!name) return null;
      const canonicalName = toolNameMap.get(name.trim().toLowerCase());
      if (!canonicalName) return null;
      const rawArgs =
        getXmlTagValue(block, ['arguments', 'args', 'parameters', 'input']) ||
        extractFirstJsonObject(block) ||
        '{}';
      return {
        id: uuid.v4() as string,
        name: canonicalName,
        arguments: stripCodeFence(rawArgs),
      };
    })
    .filter((item): item is { id: string; name: string; arguments: string } => item !== null);
};

const stripLegacyXmlToolCalls = (content: string): string => {
  const stripped = content
    .replace(/<tool_call[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<function_call[\s\S]*?<\/function_call>/gi, '')
    .replace(/<invoke[\s\S]*?<\/invoke>/gi, '')
    .replace(/<tool[\s\S]*?<\/tool>/gi, '')
    .replace(/<call[\s\S]*?<\/call>/gi, '')
    .trim();
  return stripped;
};

const extractToolRequestEntries = (parsed: any): any[] => {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.tool_calls)) return parsed.tool_calls;
  if (Array.isArray(parsed.calls)) return parsed.calls;
  if (Array.isArray(parsed.tools)) return parsed.tools;
  if (parsed.tool_call && typeof parsed.tool_call === 'object') return [parsed.tool_call];
  if (parsed.call && typeof parsed.call === 'object') return [parsed.call];

  const singleName =
    parsed.function?.name ||
    parsed.name ||
    parsed.tool ||
    parsed.tool_name ||
    parsed.function_name;
  if (singleName) return [parsed];
  return [];
};

const normalizeToolCallFromLegacyJson = (
  entry: any,
  toolNameMap: Map<string, string>
): { id: string; name: string; arguments: string } | null => {
  const rawName =
    entry?.function?.name ||
    entry?.name ||
    entry?.tool ||
    entry?.tool_name ||
    entry?.function_name;
  if (!rawName || typeof rawName !== 'string') return null;

  const canonicalName = toolNameMap.get(rawName.trim().toLowerCase());
  if (!canonicalName) return null;

  const rawArgs =
    entry?.function?.arguments ??
    entry?.arguments ??
    entry?.args ??
    entry?.parameters ??
    entry?.input ??
    {};

  const normalizedArgs =
    typeof rawArgs === 'string' ? stripCodeFence(rawArgs) : JSON.stringify(rawArgs ?? {});

  return {
    id: (entry?.id || uuid.v4()) as string,
    name: canonicalName,
    arguments: normalizedArgs,
  };
};

export const extractLegacyJsonToolCalls = (
  content: string,
  toolNameMap: Map<string, string>
): Array<{ id: string; name: string; arguments: string }> => {
  if (!content || !content.trim()) return [];

  const candidates = new Set<string>();
  const trimmed = content.trim();
  candidates.add(trimmed);
  candidates.add(stripCodeFence(trimmed));

  const firstJsonObject = extractFirstJsonObject(trimmed);
  if (firstJsonObject) candidates.add(firstJsonObject);

  const codeBlocks = trimmed.match(/```json[\s\S]*?```/gi) || [];
  codeBlocks.forEach(block => candidates.add(stripCodeFence(block)));

  const parsedCalls: Array<{ id: string; name: string; arguments: string }> = [];
  const seen = new Set<string>();

  const candidateArray = Array.from(candidates);
  for (const candidate of candidateArray) {
    if (!candidate || !candidate.trim()) continue;
    try {
      const parsed = tryParseJsonWithRepair(candidate);
      const entries = extractToolRequestEntries(parsed);
      for (const entry of entries) {
        const normalized = normalizeToolCallFromLegacyJson(entry, toolNameMap);
        if (!normalized) continue;
        const key = `${normalized.name}:${normalized.arguments}`;
        if (seen.has(key)) continue;
        seen.add(key);
        parsedCalls.push(normalized);
      }
    } catch {
      // Ignore non-JSON candidates.
    }
  }

  return parsedCalls;
};

export const stripLegacyStructuredToolCalls = (content: string): string => {
  const withoutXml = stripLegacyXmlToolCalls(content);
  const trimmed = withoutXml.trim();
  if (!trimmed) return '';

  const normalized = stripCodeFence(trimmed);
  if (!normalized) return '';
  if (!(normalized.startsWith('{') || normalized.startsWith('['))) return withoutXml;

  try {
    const parsed = tryParseJsonWithRepair(normalized);
    const entries = extractToolRequestEntries(parsed);
    if (entries.length > 0) return '';
  } catch {
    // keep original text
  }
  return withoutXml;
};

export const tryParseJsonWithRepair = (value: string): any => {
  const normalized = stripCodeFence(value);
  try {
    return JSON.parse(normalized);
  } catch {
    const repaired = normalized
      .replace(/([{,]\s*)'([^']+?)'\s*:/g, '$1"$2":')
      .replace(/:\s*'([^']*)'/g, ': "$1"');
    return JSON.parse(repaired);
  }
};

export const parseToolArguments = (rawArgs: string, toolName: string): any => {
  if (!rawArgs || !rawArgs.trim()) return {};

  const trimmed = rawArgs.trim();
  if (trimmed.startsWith('<')) {
    const embeddedArgs = getXmlTagValue(trimmed, ['arguments', 'args', 'parameters', 'input']);
    if (embeddedArgs) {
      return parseToolArguments(embeddedArgs, toolName);
    }
  }

  try {
    const parsed = tryParseJsonWithRepair(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return { value: parsed };
  } catch {
    throw new Error(`Invalid JSON arguments for tool "${toolName}"`);
  }
};

export const serializeToolResult = (value: any): string => {
  if (typeof value === 'string') return value;

  // Handle standard MCP CallToolResult format by flattening the text content.
  // This prevents the AI from seeing double-JSON-encoded payload strings,
  // making formatting issues or rich error feedback much clearer.
  if (value && typeof value === 'object' && Array.isArray(value.content)) {
    const textParts = value.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text);

    // If there's extra root metadata besides 'content' and 'isError'/'_meta', preserve it at the top level
    const extraKeys = Object.keys(value).filter(k => k !== 'content' && k !== 'isError' && k !== '_meta');
    
    if (extraKeys.length > 0) {
      // If there are extra top-level keys, send an object containing the text and the extra keys
      const output: any = {};
      if (textParts.length > 0) {
        // Try to parse the text as JSON to avoid escaping it again
        let parsedText;
        try { parsedText = JSON.parse(textParts.join('\n')); } catch { parsedText = textParts.join('\n'); }
        output.content = parsedText;
      }
      for (const k of extraKeys) output[k] = value[k];
      if (value.isError) output.isError = true;
      try {
        return JSON.stringify(output, null, 2);
      } catch {
        return String(output);
      }
    } else {
      // Just return the unwrapped text, which is cleaner
      const rawText = textParts.join('\n');
      // Even if value.isError is true, standard AI tool use just expects the error text directly.
      return rawText;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const buildToolExecutionQueue = (
  calls: Array<{ id: string; name: string; arguments: string }>
): Array<{ id: string; name: string; arguments: string }> => {
  const queue: Array<{ id: string; name: string; arguments: string }> = [];
  const seen = new Set<string>();

  for (const call of calls) {
    const key = call.id;
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(call);
  }

  return queue;
};
