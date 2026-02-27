import { ChatModelOption } from '../../services/llm/modelSelection';

export interface IsModelOptionActiveArgs {
  option: ChatModelOption;
  activeProviderId: string;
  activeModel: string;
  resolvedSelection: ChatModelOption | null;
}

export const isModelOptionActive = (args: IsModelOptionActiveArgs): boolean => {
  const selectedProviderId = args.resolvedSelection?.providerId || args.activeProviderId;
  const selectedModel = args.resolvedSelection?.model || args.activeModel;

  return args.option.providerId === selectedProviderId && args.option.model === selectedModel;
};
