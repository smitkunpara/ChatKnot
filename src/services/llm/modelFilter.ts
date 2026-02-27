const NON_TEXT_ID_PATTERN =
  /(embedding|dall[-_ ]?e|whisper|tts|transcribe|speech|moderation|rerank|omni-moderation|image-generator|vision-preview|image)/i;

const toStringArray = (value: any): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item : ''))
    .filter(Boolean)
    .map((item) => item.toLowerCase());
};

const getModelId = (model: any): string => {
  if (typeof model === 'string') return model.trim();
  if (typeof model?.id === 'string') return model.id.trim();
  if (typeof model?.name === 'string') return model.name.trim();
  return '';
};

const getTextModalitySignal = (model: any): boolean | null => {
  const outputs = [
    ...toStringArray(model?.output_modalities),
    ...toStringArray(model?.supported_output_modalities),
    ...toStringArray(model?.modalities?.output),
    ...toStringArray(model?.modalities),
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

export const isModelLikelyTextOutput = (model: any): boolean => {
  const modelId = getModelId(model);
  if (!modelId) return false;

  const textSignal = getTextModalitySignal(model);
  return textSignal ?? isLikelyTextModelById(modelId);
};

export const filterModelsForTextOutput = (models: any[]): string[] => {
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
