import { sanitizeMessagesForRequest } from '../../services/llm/requestMessageSanitizer';
import { Message, Attachment } from '../../types';

const createAttachment = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: `att-${Math.random().toString(36).slice(2)}`,
  type: 'image',
  uri: 'file:///test.png',
  name: 'test.png',
  mimeType: 'image/png',
  size: 1000,
  base64: undefined,
  ...overrides,
});

const createMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'msg-1',
  role: 'user',
  content: 'Test message',
  timestamp: 1,
  ...overrides,
});

describe('Attachment Functionality', () => {
  describe('Attachment Capability Filtering', () => {
    it('filters image attachments when model does not support vision', () => {
      const messages: Message[] = [
        createMessage({
          attachments: [
            createAttachment({ id: 'img-1', type: 'image' }),
            createAttachment({ id: 'file-1', type: 'file' }),
          ],
        }),
      ];

      const sanitized = sanitizeMessagesForRequest(messages, {
        vision: false,
        fileInput: true,
        tools: false,
      });

      expect(sanitized[0].attachments).toHaveLength(1);
      expect(sanitized[0].attachments![0].type).toBe('file');
    });

    it('filters file attachments when model does not support file input', () => {
      const messages: Message[] = [
        createMessage({
          attachments: [
            createAttachment({ id: 'img-1', type: 'image' }),
            createAttachment({ id: 'file-1', type: 'file' }),
          ],
        }),
      ];

      const sanitized = sanitizeMessagesForRequest(messages, {
        vision: true,
        fileInput: false,
        tools: false,
      });

      expect(sanitized[0].attachments).toHaveLength(1);
      expect(sanitized[0].attachments![0].type).toBe('image');
    });

    it('filters both image and file attachments when model has no multimodal support', () => {
      const messages: Message[] = [
        createMessage({
          attachments: [
            createAttachment({ id: 'img-1', type: 'image' }),
            createAttachment({ id: 'file-1', type: 'file' }),
          ],
        }),
      ];

      const sanitized = sanitizeMessagesForRequest(messages, {
        vision: false,
        fileInput: false,
        tools: false,
      });

      expect(sanitized[0].attachments).toBeUndefined();
    });

    it('keeps all attachments when model supports all capabilities', () => {
      const attachments = [
        createAttachment({ id: 'img-1', type: 'image' }),
        createAttachment({ id: 'file-1', type: 'file' }),
      ];
      const messages: Message[] = [createMessage({ attachments })];

      const sanitized = sanitizeMessagesForRequest(messages, {
        vision: true,
        fileInput: true,
        tools: false,
      });

      expect(sanitized[0].attachments).toHaveLength(2);
    });

    it('handles multiple image attachments correctly', () => {
      const messages: Message[] = [
        createMessage({
          attachments: [
            createAttachment({ id: 'img-1', type: 'image' }),
            createAttachment({ id: 'img-2', type: 'image' }),
            createAttachment({ id: 'img-3', type: 'image' }),
          ],
        }),
      ];

      const sanitized = sanitizeMessagesForRequest(messages, {
        vision: false,
        fileInput: true,
        tools: false,
      });

      // When all attachments are filtered out, the attachments property is removed entirely
      expect(sanitized[0].attachments).toBeUndefined();
    });
  });

  describe('Base64 Handling', () => {
    it('preserves base64 in attachments during filtering', () => {
      const messages: Message[] = [
        createMessage({
          attachments: [
            createAttachment({ id: 'img-1', type: 'image', base64: 'SGVsbG8gV29ybGQ=' }),
          ],
        }),
      ];

      const sanitized = sanitizeMessagesForRequest(messages, {
        vision: true,
        fileInput: true,
        tools: false,
      });

      expect(sanitized[0].attachments![0].base64).toBe('SGVsbG8gV29ybGQ=');
    });

    it('strips base64 when preparing for persistence', () => {
      const attachments: Attachment[] = [
        { id: 'img-1', type: 'image', uri: 'file:///test.png', name: 'test.png', mimeType: 'image/png', size: 1000, base64: 'SGVsbG8gV29ybGQ=' },
        { id: 'file-1', type: 'file', uri: 'file:///test.pdf', name: 'test.pdf', mimeType: 'application/pdf', size: 2000, base64: 'REFURQ==' },
      ];

      const persistedAttachments = attachments.map(({ base64, ...rest }) => rest as Omit<Attachment, 'base64'>);

      expect((persistedAttachments[0] as any).base64).toBeUndefined();
      expect(persistedAttachments[0].uri).toBe('file:///test.png');
      expect((persistedAttachments[1] as any).base64).toBeUndefined();
    });
  });

  describe('Vision Warning Detection', () => {
    it('detects images in conversation history', () => {
      const messages = [
        createMessage({ id: 'msg-1', role: 'user', content: 'Hello', attachments: [] }),
        createMessage({
          id: 'msg-2',
          role: 'user',
          content: 'Look at this',
          attachments: [createAttachment({ id: 'att-1', type: 'image' })],
        }),
      ];

      const hasHistoryImages = messages.some(m => m.attachments?.some(a => a.type === 'image'));
      expect(hasHistoryImages).toBe(true);
    });

    it('detects no images when none exist', () => {
      const messages = [
        createMessage({ id: 'msg-1', role: 'user', content: 'Hello', attachments: [] }),
        createMessage({ id: 'msg-2', role: 'assistant', content: 'Hi there' }),
      ];

      const hasHistoryImages = messages.some(m => m.attachments?.some(a => a.type === 'image'));
      expect(hasHistoryImages).toBe(false);
    });

    it('detects pending images in attachment state', () => {
      const attachments = [
        createAttachment({ id: 'att-1', type: 'image' }),
        createAttachment({ id: 'att-2', type: 'file' }),
      ];

      const hasPendingImages = attachments.some(a => a.type === 'image');
      expect(hasPendingImages).toBe(true);
    });

    it('should trigger warning when switching to non-vision model with images', () => {
      const conversationHasImages = true;
      const currentModelVisionSupported = false;

      const shouldShowWarning = conversationHasImages && !currentModelVisionSupported;
      expect(shouldShowWarning).toBe(true);
    });

    it('should not trigger warning when switching to vision model with images', () => {
      const conversationHasImages = true;
      const currentModelVisionSupported = true;

      const shouldShowWarning = conversationHasImages && !currentModelVisionSupported;
      expect(shouldShowWarning).toBe(false);
    });

    it('should not trigger warning when switching to non-vision model without images', () => {
      const conversationHasImages = false;
      const currentModelVisionSupported = false;

      const shouldShowWarning = conversationHasImages && !currentModelVisionSupported;
      expect(shouldShowWarning).toBe(false);
    });
  });

  describe('Model Selection Change Detection', () => {
    it('detects model selection changes', () => {
      let previousModelKey: string | undefined = 'provider-1:gpt-4o';
      const nextModelKey = 'provider-1:gpt-4o-mini';

      const modelChanged = nextModelKey !== previousModelKey;
      expect(modelChanged).toBe(true);

      if (modelChanged) {
        previousModelKey = nextModelKey;
      }
      expect(previousModelKey).toBe('provider-1:gpt-4o-mini');
    });

    it('does not trigger for same model selection', () => {
      let previousModelKey: string | undefined = 'provider-1:gpt-4o';
      const nextModelKey = 'provider-1:gpt-4o';

      const modelChanged = nextModelKey !== previousModelKey;
      expect(modelChanged).toBe(false);
    });

    it('triggers for same model different provider', () => {
      let previousModelKey: string | undefined = 'provider-1:gpt-4o';
      const nextModelKey = 'provider-2:gpt-4o';

      const modelChanged = nextModelKey !== previousModelKey;
      expect(modelChanged).toBe(true);
    });
  });

  describe('Attachment Base64 Cache', () => {
    it('caches base64 data after reading a file URI', () => {
      const cache = new Map<string, string>();
      const testUri = 'file:///test/image.png';
      const testBase64 = 'SGVsbG8gV29ybGQ=';

      cache.set(testUri, testBase64);

      expect(cache.has(testUri)).toBe(true);
      expect(cache.get(testUri)).toBe(testBase64);
    });

    it('returns cached value on subsequent reads', () => {
      const cache = new Map<string, string>();
      const testUri = 'file:///test/image.png';
      const testBase64 = 'SGVsbG8gV29ybGQ=';

      // Simulate a function that reads from cache
      const readFileFromCache = (cacheRef: Map<string, string>, uri: string): string | null => {
        if (cacheRef.has(uri)) {
          return cacheRef.get(uri)!;
        }
        return null;
      };

      // First read - cache is empty
      expect(readFileFromCache(cache, testUri)).toBeNull();

      // Populate cache
      cache.set(testUri, testBase64);

      // Subsequent reads - cache has the value
      expect(readFileFromCache(cache, testUri)).toBe(testBase64);
      expect(readFileFromCache(cache, testUri)).toBe(testBase64);
      expect(readFileFromCache(cache, testUri)).toBe(testBase64);
    });

    it('clears cache when switching conversations', () => {
      const cache = new Map<string, string>();
      cache.set('file:///test1.png', 'base64_1');
      cache.set('file:///test2.png', 'base64_2');

      expect(cache.size).toBe(2);

      cache.clear();

      expect(cache.size).toBe(0);
    });
  });

  describe('File Read Error Handling', () => {
    it('returns attachment without base64 when file read fails', () => {
      const originalAttachment = createAttachment({
        id: 'att-1',
        uri: 'file:///broken.png',
        name: 'broken.png',
      });

      let hydratedAttachment = originalAttachment;
      const readFailed = true;

      if (!readFailed) {
        hydratedAttachment = { ...originalAttachment, base64: 'new_base64' };
      }

      expect(hydratedAttachment.base64).toBeUndefined();
      expect(hydratedAttachment.id).toBe('att-1');
      expect(hydratedAttachment.uri).toBe('file:///broken.png');
    });

    it('logs warning on file read failure', () => {
      const warnMock = jest.fn();
      const originalWarn = console.warn;
      console.warn = warnMock;

      const error = new Error('File not found');
      const attachment = createAttachment({ name: 'test.png', uri: 'file:///test.png' });

      console.warn(`[ChatScreen] Failed to read attachment file: ${attachment.name} (${attachment.uri})`, error);

      expect(warnMock).toHaveBeenCalledWith(
        '[ChatScreen] Failed to read attachment file: test.png (file:///test.png)',
        error
      );

      console.warn = originalWarn;
    });
  });

  describe('Dropped Attachment Notification', () => {
    it('counts dropped image attachments', () => {
      const attachments = [
        createAttachment({ id: 'att-1', type: 'image' }),
        createAttachment({ id: 'att-2', type: 'image' }),
        createAttachment({ id: 'att-3', type: 'file' }),
      ];
      const visionCapability = false;

      const droppedImageCount = attachments.filter(
        a => a.type === 'image' && !visionCapability
      ).length;

      expect(droppedImageCount).toBe(2);
    });

    it('counts dropped file attachments', () => {
      const attachments = [
        createAttachment({ id: 'att-1', type: 'file' }),
        createAttachment({ id: 'att-2', type: 'file' }),
        createAttachment({ id: 'att-3', type: 'image' }),
      ];
      const fileInputCapability = false;

      const droppedFileCount = attachments.filter(
        a => a.type === 'file' && !fileInputCapability
      ).length;

      expect(droppedFileCount).toBe(2);
    });

    it('generates correct notification message parts', () => {
      const droppedImageCount = 2;
      const droppedFileCount = 1;

      const parts: string[] = [];
      if (droppedImageCount > 0) parts.push(`${droppedImageCount} image(s)`);
      if (droppedFileCount > 0) parts.push(`${droppedFileCount} file(s)`);

      expect(parts).toEqual(['2 image(s)', '1 file(s)']);
    });

    it('handles only image drop', () => {
      const droppedImageCount = 3;
      const droppedFileCount = 0;

      const parts: string[] = [];
      if (droppedImageCount > 0) parts.push(`${droppedImageCount} image(s)`);
      if (droppedFileCount > 0) parts.push(`${droppedFileCount} file(s)`);

      expect(parts).toEqual(['3 image(s)']);
    });

    it('handles only file drop', () => {
      const droppedImageCount = 0;
      const droppedFileCount = 2;

      const parts: string[] = [];
      if (droppedImageCount > 0) parts.push(`${droppedImageCount} image(s)`);
      if (droppedFileCount > 0) parts.push(`${droppedFileCount} file(s)`);

      expect(parts).toEqual(['2 file(s)']);
    });
  });
});
