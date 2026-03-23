import { Alert, Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Paths, File } from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import { Conversation } from '../../types';
import { toMarkdown, MarkdownExportOptions } from './MarkdownExporter';
import { toJson, JsonExportOptions } from './JsonExporter';
import { toHtml, HtmlExportOptions } from './HtmlExporter';

export type ExportFormat = 'pdf' | 'markdown' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  includeToolInput: boolean;
  includeToolOutput: boolean;
  includeThinking?: boolean;
}

interface ExportResult {
  content: string;
  mimeType: string;
  uri: string;
  cacheFile?: File;
}

const generateExportContent = async (
  conversation: Conversation,
  opts: ExportOptions,
  safeTitle: string
): Promise<ExportResult> => {
  switch (opts.format) {
    case 'markdown': {
      const markdownOpts: MarkdownExportOptions = {
        includeToolInput: opts.includeToolInput,
        includeToolOutput: opts.includeToolOutput,
        includeThinking: opts.includeThinking,
      };
      const content = toMarkdown(conversation, markdownOpts);
      const file = new File(Paths.cache, `${safeTitle}.md`);
      file.write(content);
      return { content, mimeType: 'text/markdown', uri: file.uri, cacheFile: file };
    }

    case 'json': {
      const jsonOpts: JsonExportOptions = {
        includeToolInput: opts.includeToolInput,
        includeToolOutput: opts.includeToolOutput,
        includeThinking: opts.includeThinking,
      };
      const content = toJson(conversation, jsonOpts);
      const file = new File(Paths.cache, `${safeTitle}.json`);
      file.write(content);
      return { content, mimeType: 'application/json', uri: file.uri, cacheFile: file };
    }

    case 'pdf': {
      const htmlOpts: HtmlExportOptions = {
        includeToolInput: opts.includeToolInput,
        includeToolOutput: opts.includeToolOutput,
        includeThinking: opts.includeThinking,
      };
      const html = toHtml(conversation, htmlOpts);
      const { uri } = await Print.printToFileAsync({ html });
      return { content: '', mimeType: 'application/pdf', uri };
    }

    default: {
      const _exhaustive: never = opts.format;
      throw new Error(`Unsupported export format: ${_exhaustive}`);
    }
  }
};

async function cleanupCacheFile(result: ExportResult): Promise<void> {
  if (result.cacheFile) {
    try {
      result.cacheFile.delete();
    } catch {
      // Best-effort cleanup; sharing already completed.
    }
  }
}

async function performExport(
  conversation: Conversation,
  opts: ExportOptions,
  safeTitle: string,
): Promise<void> {
  const result = await generateExportContent(conversation, opts, safeTitle);
  try {
    await Sharing.shareAsync(result.uri, { mimeType: result.mimeType, dialogTitle: 'Export Chat' });
  } finally {
    await cleanupCacheFile(result);
  }
}

async function performClipboardCopy(
  conversation: Conversation,
  opts: ExportOptions,
  safeTitle: string,
): Promise<void> {
  const result = await generateExportContent(conversation, { ...opts, format: 'json' }, safeTitle);
  try {
    await Clipboard.setStringAsync(result.content);
    Alert.alert('Copied', 'Chat JSON copied to clipboard.');
  } finally {
    await cleanupCacheFile(result);
  }
}

export async function exportChat(
  conversation: Conversation,
  opts: ExportOptions,
): Promise<void> {
  const sanitizedTitle = conversation.title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
  const safeTitle = sanitizedTitle || 'chat_export';

  if (opts.includeToolInput || opts.includeToolOutput) {
    return new Promise((resolve, reject) => {
      let settled = false;

      const settle = (action: () => Promise<void>) => {
        if (settled) return;
        settled = true;
        action().then(resolve).catch(reject);
      };

      const buttons: Array<{ text: string; style?: 'cancel' | 'default' | 'destructive'; onPress: () => void }> = [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => reject(new Error('Export cancelled')),
        },
        {
          text: 'Export',
          onPress: () => settle(() => performExport(conversation, opts, safeTitle)),
        },
        {
          text: 'Copy JSON',
          onPress: () => settle(() => performClipboardCopy(conversation, opts, safeTitle)),
        },
      ];

      if (Platform.OS === 'android') {
        Alert.alert(
          'Export May Contain Sensitive Data',
          'Including tool inputs/outputs may expose API keys, tokens, or other sensitive data from MCP server interactions. Continue?',
          buttons,
          { cancelable: true, onDismiss: () => reject(new Error('Export cancelled')) },
        );
      } else {
        Alert.alert(
          'Export May Contain Sensitive Data',
          'Including tool inputs/outputs may expose API keys, tokens, or other sensitive data from MCP server interactions. Continue?',
          buttons,
        );
      }
    });
  }

  await performExport(conversation, opts, safeTitle);
}

export { toMarkdown, MarkdownExportOptions } from './MarkdownExporter';
export { toJson, JsonExportOptions } from './JsonExporter';
export { toHtml, HtmlExportOptions } from './HtmlExporter';
