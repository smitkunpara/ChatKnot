import React from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageSquare, PlusCircle, Settings as SettingsIcon, Trash2 } from 'lucide-react-native';
import { useChatStore } from '../../store/useChatStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAppTheme } from '../../theme/useAppTheme';
import {
  getSidebarConversationLabel,
  getSidebarNewChatCtaLabel,
} from '../../utils/dateFormat';

export const Sidebar: React.FC<DrawerContentComponentProps> = (props) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const conversations = useChatStore(state => state.conversations);
  const activeId = useChatStore(state => state.activeConversationId);
  const setActive = useChatStore(state => state.setActiveConversation);
  const createNew = useChatStore(state => state.createConversation);
  const deleteConversation = useChatStore(state => state.deleteConversation);

  const providers = useSettingsStore(state => state.providers);
  const systemPrompt = useSettingsStore(state => state.systemPrompt);
  const newChatLabel = getSidebarNewChatCtaLabel();

  const handleCreateConversation = () => {
    const provider = providers.find(p => p.enabled) || providers[0];
    const providerId = provider?.id || 'openai';
    createNew(providerId, systemPrompt || 'You are a helpful assistant.');
    props.navigation.navigate('Chat');
    props.navigation.closeDrawer();
  };

  const handleSelect = (id: string) => {
    setActive(id);
    props.navigation.navigate('Chat');
    props.navigation.closeDrawer();
  };

  const handleDelete = (id: string, e: any) => {
    e.stopPropagation();
    deleteConversation(id);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.brand}>MCP Connector</Text>
        <TouchableOpacity style={styles.newChatButton} onPress={handleCreateConversation}>
          <PlusCircle size={20} color={colors.onPrimary} />
          <Text style={styles.newChatText}>{newChatLabel}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No conversations yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.item, item.id === activeId ? styles.activeItem : undefined]}
            onPress={() => handleSelect(item.id)}
          >
            <View style={styles.itemMain}>
              <MessageSquare size={17} color={item.id === activeId ? colors.primary : colors.textTertiary} />
              <Text
                style={[styles.itemText, item.id === activeId ? styles.activeItemText : undefined]}
                numberOfLines={1}
              >
                {getSidebarConversationLabel(item)}
              </Text>
            </View>
            <TouchableOpacity onPress={(e) => handleDelete(item.id, e)} style={styles.deleteBtn}>
              <Trash2 size={15} color={colors.textTertiary} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />

      <View style={styles.footer}>
        <TouchableOpacity style={styles.settingsButton} onPress={() => props.navigation.navigate('Settings')}>
          <SettingsIcon size={18} color={colors.text} />
          <Text style={styles.settingsText}>Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    brand: {
      color: colors.textTertiary,
      fontSize: 11,
      fontWeight: '700',
      marginBottom: 10,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    newChatButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      backgroundColor: colors.primary,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    newChatText: {
      color: colors.onPrimary,
      marginLeft: 10,
      fontWeight: '700',
      fontSize: 14,
    },
    list: {
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 12,
    },
    emptyWrap: {
      paddingVertical: 24,
      alignItems: 'center',
    },
    emptyText: {
      color: colors.textTertiary,
      fontSize: 13,
    },
    item: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 11,
      paddingHorizontal: 10,
      borderRadius: 10,
      marginVertical: 2,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    itemMain: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    activeItem: {
      backgroundColor: colors.surfaceAlt,
      borderColor: colors.subtleBorder,
    },
    itemText: {
      color: colors.textSecondary,
      marginLeft: 10,
      fontSize: 13,
      flex: 1,
    },
    activeItemText: {
      color: colors.text,
      fontWeight: '600',
    },
    deleteBtn: {
      padding: 4,
    },
    footer: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    settingsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.subtleBorder,
    },
    settingsText: {
      color: colors.text,
      marginLeft: 10,
      fontSize: 14,
      fontWeight: '600',
    },
  });
