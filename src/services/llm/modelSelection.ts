import { LlmProviderConfig, LastUsedModelPreference } from '../../types';
import { isModelIdLikelyTextOutput } from './modelFilter';
import { normalize } from '../../utils/stringUtils';

export interface ChatModelOption {
  providerId: string;
  providerName: string;
  model: string;
}

export interface ResolveModelSelectionArgs {
  providers: LlmProviderConfig[];
  selectedProviderId?: string;
  selectedModel?: string;
  lastUsedModel?: LastUsedModelPreference | null;
}

export interface ResolveModelSelectionResult {
  availableModels: ChatModelOption[];
  selection: ChatModelOption | null;
  message: string | null;
}

export const CHAT_NO_MODEL_AVAILABLE_MESSAGE =
  'No model is available for chat. Configure a provider, API key, and visible model in Settings.';

const hasProviderSetup = (provider: LlmProviderConfig): boolean => {
  const hasApiCredential =
    normalize(provider.apiKey).length > 0 || !!provider.apiKeyRef;

  return provider.enabled && hasApiCredential && normalize(provider.baseUrl).length > 0;
};

const getProviderModelCandidates = (provider: LlmProviderConfig): string[] => {
  if (Array.isArray(provider.availableModels) && provider.availableModels.length > 0) {
    return provider.availableModels;
  }

  return provider.model ? [provider.model] : [];
};

export const getProviderVisibleModels = (provider: LlmProviderConfig): string[] => {
if (!hasProviderSetup(provider)) {
    return [];
  }

  const hiddenModels = new Set((provider.hiddenModels || []).map((model) => normalize(model)));
  const candidates = getProviderModelCandidates(provider);
  const result: string[] = [];
  const seen = new Set<string>();

  for (const model of candidates) {
    const normalizedModel = normalize(model);
    if (!normalizedModel) continue;
    if (seen.has(normalizedModel)) continue;
    if (hiddenModels.has(normalizedModel)) continue;
    if (!isModelIdLikelyTextOutput(normalizedModel)) continue;

    seen.add(normalizedModel);
    result.push(normalizedModel);
  }

  return result;
};

export const getChatAvailableModels = (providers: LlmProviderConfig[]): ChatModelOption[] => {
if (!Array.isArray(providers)) {
    return [];
  }

  const options: ChatModelOption[] = [];

  for (const provider of providers) {
    for (const model of getProviderVisibleModels(provider)) {
      options.push({
        providerId: provider.id,
        providerName: provider.name,
        model,
      });
    }
  }

  return options;
};

const findOption = (
  options: ChatModelOption[],
  providerId: string | undefined,
  model: string | undefined
): ChatModelOption | null => {
  const normalizedProviderId = normalize(providerId);
  const normalizedModel = normalize(model);
  if (!normalizedProviderId || !normalizedModel) {
    return null;
  }

  return (
    options.find(
      (option) => option.providerId === normalizedProviderId && option.model === normalizedModel
    ) || null
  );
};

export const resolveModelSelection = (
  args: ResolveModelSelectionArgs
): ResolveModelSelectionResult => {
const availableModels = getChatAvailableModels(args.providers || []);

  const fromSelection = findOption(
    availableModels,
    args.selectedProviderId,
    args.selectedModel
  );

  const fromLastUsed = findOption(
    availableModels,
    args.lastUsedModel?.providerId,
    args.lastUsedModel?.model
  );

  const selection = fromSelection || fromLastUsed || availableModels[0] || null;

  return {
    availableModels,
    selection,
    message: selection ? null : CHAT_NO_MODEL_AVAILABLE_MESSAGE,
  };
};
