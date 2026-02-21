// @ts-nocheck
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChatStore } from '../store/useChatStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { MessageBubble } from '../components/Chat/MessageBubble';
import { Input } from '../components/Chat/Input';
import { ModelSelector } from '../components/Chat/ModelSelector';
import { ProviderFactory } from '../services/llm/ProviderFactory';
import { McpManager } from '../services/mcp/McpManager';
import { ToolCall } from '../types';
import uuid from 'react-native-uuid';
import { Menu } from 'lucide-react-native';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';

export const ChatScreen = () => {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  
  const activeConversationId = useChatStore(state => state.activeConversationId);
  const conversations = useChatStore(state => state.conversations);
  const isLoading = useChatStore(state => state.isLoading);
  
  const addMessage = useChatStore(state => state.addMessage);
  const updateMessage = useChatStore(state => state.updateMessage);
  const editMessage = useChatStore(state => state.editMessage);
  const addToolCall = useChatStore(state => state.addToolCall);
  const updateToolCallStatus = useChatStore(state => state.updateToolCallStatus);
  const updateModelInConversation = useChatStore(state => state.updateModelInConversation);
  const setLoading = useChatStore(state => state.setLoading);
  
  const providers = useSettingsStore(state => state.providers);
  const systemPrompt = useSettingsStore(state => state.systemPrompt);
  
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<string | undefined>(undefined);

  const activeConversation = useMemo(() => 
    conversations.find(c => c.id === activeConversationId),
    [conversations, activeConversationId]
  );

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (activeConversation?.messages.length) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [activeConversation?.messages.length, activeConversationId]);

  const handleSend = async (text: string) => {
    if (!activeConversationId) return;
    if (editingMessageId) {
       editMessage(activeConversationId, editingMessageId, text);
       setEditingMessageId(null);
       setEditingContent(undefined);
    } else {
       addMessage(activeConversationId, { role: 'user', content: text });
    }
    setLoading(true);
    await runChatLoop();
  };

  const handleEdit = (messageId: string, content: string) => {
     if (!activeConversationId) return;
     setEditingMessageId(messageId);
     setEditingContent(content);
  };

  const runChatLoop = async () => {
    try {
      let continueLoop = true;
      let iterationCount = 0;
      const MAX_ITERATIONS = 5; 

      while (continueLoop && iterationCount < MAX_ITERATIONS) {
        iterationCount++;
        const currentConv = useChatStore.getState().conversations.find(c => c.id === activeConversationId);
        if (!currentConv) break;

        let providerConfig = providers.find(p => p.id === currentConv.providerId);
        if (!providerConfig) {
          providerConfig = providers.find(p => p.enabled) || providers[0];
        }

        if (!providerConfig || (!providerConfig.model && !currentConv.modelOverride)) {
          alert('No model selected! Please configure in Settings.');
          break;
        }

        // Apply model override if present
        const effectiveConfig = {
            ...providerConfig,
            model: currentConv.modelOverride || providerConfig.model
        };

        const service = ProviderFactory.create(effectiveConfig);
        const mcpTools = McpManager.getTools();
        const openApiContext = (McpManager as any).getOpenApiContexts();

        const openAiTools = mcpTools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          }
        }));

        const assistantMsgId = uuid.v4() as string;
        addMessage(activeConversationId!, { id: assistantMsgId, role: 'assistant', content: ' ' });

        const finalSystemPrompt = `${currentConv.systemPrompt || systemPrompt}\n\n${openApiContext ? `Additional API Context:\n${openApiContext}` : ''}`;

        const result = await new Promise<{fullContent: string, toolCalls?: any[]}>((resolve, reject) => {
          service.sendChatCompletion(
            currentConv.messages,
            finalSystemPrompt,
            openAiTools,
            (content) => {
              if (content) updateMessage(activeConversationId!, assistantMsgId, content);
            },
            (fullContent, fullToolCalls) => resolve({ fullContent, toolCalls: fullToolCalls }),
            (error) => reject(error)
          ).catch(reject);
        });

        updateMessage(activeConversationId!, assistantMsgId, result.fullContent);

        if (result.toolCalls && result.toolCalls.length > 0) {
          for (const call of result.toolCalls) {
            const toolCallId = (call.id || uuid.v4()) as string;
            const name = call.function.name;
            const args = call.function.arguments;
            const toolCall: ToolCall = { id: toolCallId, name, arguments: args, status: 'pending' };
            addToolCall(activeConversationId!, assistantMsgId, toolCall);
            updateToolCallStatus(activeConversationId!, assistantMsgId, toolCallId, 'running');
            try {
              let parsedArgs = {};
              try { parsedArgs = JSON.parse(args); } catch (e) {}
              const toolResult = await McpManager.executeTool(name, parsedArgs);
              const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
              updateToolCallStatus(activeConversationId!, assistantMsgId, toolCallId, 'completed', resultStr);
              addMessage(activeConversationId!, { role: 'tool', content: resultStr, toolCallId: toolCallId });
            } catch (error: any) {
              const errorStr = error.message || 'Unknown error';
              updateToolCallStatus(activeConversationId!, assistantMsgId, toolCallId, 'failed', errorStr);
              addMessage(activeConversationId!, { role: 'tool', content: `Error: ${errorStr}`, toolCallId: toolCallId });
            }
          }
          continueLoop = true;
        } else {
          continueLoop = false;
        }
      }
    } catch (e: any) {
      console.error('Chat Loop Error:', e);
      alert('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuButton}>
          <Menu size={22} color="#fff" />
        </TouchableOpacity>
        {activeConversation && (
          <View style={styles.selectorWrapper}>
            <ModelSelector 
              activeProviderId={activeConversation.providerId} 
              activeModel={activeConversation.modelOverride || ''}
              onSelect={(pid, model) => updateModelInConversation(activeConversation.id, pid, model)} 
            />
          </View>
        )}
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={styles.content}
      >
        {!activeConversation ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Select or start a new conversation.</Text>
          </View>
        ) : (
          <>
            <FlatList
              ref={flatListRef}
              data={activeConversation.messages}
              keyExtractor={item => item.id}
              renderItem={({ item, index }) => (
                <MessageBubble 
                  message={item} 
                  onEdit={handleEdit}
                  isStreaming={isLoading && item.role === 'assistant' && index === activeConversation.messages.length - 1} 
                />
              )}
              contentContainerStyle={styles.listContent}
            />
            {isLoading && (
              <View style={styles.loadingIndicator}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.loadingText}>AI is responding...</Text>
              </View>
            )}
          </>
        )}
        <Input 
          onSend={handleSend} 
          isLoading={isLoading} 
          onStop={() => setLoading(false)} 
          initialValue={editingContent}
          isEditing={!!editingMessageId}
          onCancelEdit={() => {
            setEditingMessageId(null);
            setEditingContent(undefined);
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    paddingHorizontal: 8,
    height: 56,
    zIndex: 100,
  },
  menuButton: {
    padding: 10,
  },
  selectorWrapper: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 10,
    paddingBottom: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
  },
  loadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    gap: 10,
  },
  loadingText: {
    color: '#888',
    fontSize: 13,
  },
});
