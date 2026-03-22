import {
  isModelLikelyTextOutput,
  filterModelsForTextOutput,
  isModelIdLikelyTextOutput,
} from '../modelFilter';

describe('isModelLikelyTextOutput', () => {
  it('returns false for empty/missing model id', () => {
    expect(isModelLikelyTextOutput('')).toBe(false);
    expect(isModelLikelyTextOutput({ id: '' })).toBe(false);
    expect(isModelLikelyTextOutput({ name: '' })).toBe(false);
    expect(isModelLikelyTextOutput(null)).toBe(false);
    expect(isModelLikelyTextOutput(undefined)).toBe(false);
  });

  it('identifies plain text models by id', () => {
    expect(isModelLikelyTextOutput('gpt-4o')).toBe(true);
    expect(isModelLikelyTextOutput('claude-3-sonnet')).toBe(true);
    expect(isModelLikelyTextOutput({ id: 'llama-3-70b' })).toBe(true);
  });

  it('filters out embedding models by id prefix', () => {
    expect(isModelLikelyTextOutput('embedding-ada-002')).toBe(false);
    expect(isModelLikelyTextOutput('embedding-large')).toBe(false);
    expect(isModelLikelyTextOutput({ id: 'embedding-ada-002' })).toBe(false);
    // 'text-embedding' prefix does NOT match the 'embedding' pattern
    expect(isModelLikelyTextOutput('text-embedding-3-small')).toBe(true);
  });

  it('filters out DALL-E models by id prefix', () => {
    expect(isModelLikelyTextOutput('dall-e-3')).toBe(false);
    expect(isModelLikelyTextOutput('dalle-2')).toBe(false);
    expect(isModelLikelyTextOutput('dalle_3')).toBe(false);
  });

  it('filters out TTS, whisper, speech, moderation by id prefix', () => {
    expect(isModelLikelyTextOutput('tts-1')).toBe(false);
    expect(isModelLikelyTextOutput('whisper-1')).toBe(false);
    expect(isModelLikelyTextOutput('speech-001')).toBe(false);
    expect(isModelLikelyTextOutput('moderation-latest')).toBe(false);
    expect(isModelLikelyTextOutput('omni-moderation-2024')).toBe(false);
    expect(isModelLikelyTextOutput('rerank-english-v2.0')).toBe(false);
    expect(isModelLikelyTextOutput('image-generator-v1')).toBe(false);
    expect(isModelLikelyTextOutput('transcribe-v1')).toBe(false);
  });

  it('uses modality metadata to determine text output', () => {
    // Explicit text output modality
    expect(isModelLikelyTextOutput({
      id: 'model-a',
      output_modalities: ['text'],
    })).toBe(true);

    // Non-text only output
    expect(isModelLikelyTextOutput({
      id: 'model-b',
      output_modalities: ['image'],
    })).toBe(false);

    // Mixed output including text
    expect(isModelLikelyTextOutput({
      id: 'model-c',
      output_modalities: ['text', 'image'],
    })).toBe(true);
  });

  it('uses supported_output_modalities field', () => {
    expect(isModelLikelyTextOutput({
      id: 'model-x',
      supported_output_modalities: ['text', 'image'],
    })).toBe(true);

    expect(isModelLikelyTextOutput({
      id: 'model-y',
      supported_output_modalities: ['image', 'audio'],
    })).toBe(false);
  });

  it('uses nested modalities.output field', () => {
    expect(isModelLikelyTextOutput({
      id: 'model-nested',
      modalities: { output: ['text'] },
    })).toBe(true);

    expect(isModelLikelyTextOutput({
      id: 'model-nested-img',
      modalities: { output: ['image'] },
    })).toBe(false);
  });

  it('falls back to id-based detection when modality metadata is empty array', () => {
    // Empty arrays produce no signal, so falls back to id pattern
    expect(isModelLikelyTextOutput({
      id: 'gpt-4o',
      output_modalities: [],
    })).toBe(true);

    expect(isModelLikelyTextOutput({
      id: 'embedding-ada-002',
      output_modalities: [],
    })).toBe(false);
  });

  it('treats unknown modalities as text-capable (permissive fallback)', () => {
    // Unknown modality string is not in the non-text list, so null is returned,
    // then falls back to id check which passes for non-prefixed names
    expect(isModelLikelyTextOutput({
      id: 'custom-model',
      output_modalities: ['unknown_modality'],
    })).toBe(true);
  });
});

describe('filterModelsForTextOutput', () => {
  it('returns empty array for non-array input', () => {
    expect(filterModelsForTextOutput(null as any)).toEqual([]);
    expect(filterModelsForTextOutput(undefined as any)).toEqual([]);
    expect(filterModelsForTextOutput('string' as any)).toEqual([]);
  });

  it('filters models by text capability', () => {
    const models = [
      { id: 'gpt-4o' },
      { id: 'embedding-ada-002' },
      { id: 'dall-e-3' },
      { id: 'claude-3-sonnet' },
      { id: 'tts-1' },
    ];

    const result = filterModelsForTextOutput(models);
    expect(result).toEqual(['gpt-4o', 'claude-3-sonnet']);
  });

  it('deduplicates models with same id', () => {
    const models = [
      { id: 'gpt-4o' },
      { id: 'gpt-4o' },
      { id: 'gpt-4o' },
    ];

    const result = filterModelsForTextOutput(models);
    expect(result).toEqual(['gpt-4o']);
  });

  it('handles string model entries', () => {
    const models = ['gpt-4o', 'embedding-ada-002', 'claude-3'];
    const result = filterModelsForTextOutput(models);
    expect(result).toEqual(['gpt-4o', 'claude-3']);
  });

  it('skips entries with no id or name', () => {
    const models = [
      { id: 'gpt-4o' },
      { name: 'named-model' }, // name is valid fallback for id
      {},
      null,
    ];

    const result = filterModelsForTextOutput(models);
    expect(result).toEqual(['gpt-4o', 'named-model']);
  });

  it('prefers modality metadata over id-based filtering', () => {
    // Model whose id looks like embedding but metadata says text
    const models = [
      {
        id: 'text-embedding-custom',
        output_modalities: ['text'],
      },
    ];

    const result = filterModelsForTextOutput(models);
    expect(result).toEqual(['text-embedding-custom']);
  });
});

describe('isModelIdLikelyTextOutput', () => {
  it('wraps isModelLikelyTextOutput with id-only lookup', () => {
    expect(isModelIdLikelyTextOutput('gpt-4o')).toBe(true);
    expect(isModelIdLikelyTextOutput('embedding-ada-002')).toBe(false);
    expect(isModelIdLikelyTextOutput('')).toBe(false);
  });
});
