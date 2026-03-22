interface ModelMetadata {
  id?: string;
  name?: string;
  output_modalities?: unknown[];
  supported_output_modalities?: unknown[];
  modalities?: unknown[] | { output?: unknown[] };
}

const NON_TEXT_ID_PATTERN =
  /^(embedding|dall[-_ ]?e|whisper|tts|transcribe|speech|moderation|rerank|omni-moderation|image-generator)/i;

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item : ''))
    .filter(Boolean)
    .map((item) => item.toLowerCase());
};

const getModelId = (model: ModelMetadata | string | unknown): string => {
  if (typeof model === 'string') return model.trim();
  if (model && typeof model === 'object') {
    const obj = model as ModelMetadata;
    if (typeof obj.id === 'string') return obj.id.trim();
    if (typeof obj.name === 'string') return obj.name.trim();
  }
  return '';
};

const getTextModalitySignal = (model: ModelMetadata | unknown): boolean | null => {
  const obj = model && typeof model === 'object' ? (model as ModelMetadata) : {};
  const modalityOutputs = obj.modalities;
  const nestedOutputs = modalityOutputs && typeof modalityOutputs === 'object' && !Array.isArray(modalityOutputs)
    ? (modalityOutputs as { output?: unknown[] }).output
    : undefined;

  const outputs = [
    ...toStringArray(obj.output_modalities),
    ...toStringArray(obj.supported_output_modalities),
    ...toStringArray(nestedOutputs),
    ...toStringArray(modalityOutputs),
  ];

  if (outputs.length === 0) return null;
  if (outputs.includes('text')) return true;

  const nonTextOnly = outputs.every((m) =>
    ['image', 'audio', 'speech', 'embedding', 'video', 'rerank'].includes(m)
  );
  if (nonTextOnly) return false;

  return null;
};

const isLikelyTextModelById = (modelId: string): boolean => {
  if (!modelId) return false;
  return !NON_TEXT_ID_PATTERN.test(modelId);
};

export const isModelLikelyTextOutput = (model: ModelMetadata | string | unknown): boolean => {
  const modelId = getModelId(model);
  if (!modelId) return false;

  const textSignal = getTextModalitySignal(model);
  return textSignal ?? isLikelyTextModelById(modelId);
};

export const filterModelsForTextOutput = (models: unknown[]): string[] => {
  if (!Array.isArray(models)) return [];

  const result: string[] = [];
  const seen = new Set<string>();

  for (const model of models) {
    const modelId = getModelId(model);
    if (!modelId) continue;
    if (!isModelLikelyTextOutput(model)) continue;
    if (seen.has(modelId)) continue;
    seen.add(modelId);
    result.push(modelId);
  }

  return result;
};

export const isModelIdLikelyTextOutput = (modelId: string): boolean =>
  isModelLikelyTextOutput({ id: modelId });
