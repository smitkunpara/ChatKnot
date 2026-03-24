import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageSquare, PlusCircle, Search, Settings as SettingsIcon, Trash2 } from 'lucide-react-native';
import { useChatStore } from '../../store/useChatStore';
import { useChatDraftStore } from '../../store/useChatDraftStore';
import { useAppTheme, AppPalette } from '../../theme/useAppTheme';
import {
  getSidebarConversationLabel,
  getSidebarNewChatCtaLabel,
} from '../../utils/dateFormat';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import {
  SidebarConversationSummary,
  sortAndFilterConversations,
} from './sidebarFilter';
import { handleDeleteConversationPress } from './conversationInteractions';

const SEARCH_BAR_MIN_CONVERSATIONS = 3;

const areConversationSummariesEqual = (
  previous: SidebarConversationSummary[],
  next: SidebarConversationSummary[]
) => {
  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const prev = previous[index];
    const curr = next[index];

    if (
      prev.id !== curr.id ||
      prev.title !== curr.title ||
      prev.createdAt !== curr.createdAt ||
      prev.updatedAt !== curr.updatedAt
    ) {
      return false;
    }
  }

  return true;
};

export const Sidebar: React.FC<DrawerContentComponentProps> = (props) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const conversations = useStoreWithEqualityFn(
    useChatStore,
    state => state.conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    })),
    areConversationSummariesEqual
  );
  const activeId = useChatStore(state => state.activeConversationId);
  const setActive = useChatStore(state => state.setActiveConversation);
  const deleteConversation = useChatStore(state => state.deleteConversation);
  const clearConversationDraft = useChatDraftStore(state => state.clearDraft);
  const newChatLabel = getSidebarNewChatCtaLabel();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = useMemo(() => {
    return sortAndFilterConversations(conversations, searchQuery);
  }, [conversations, searchQuery]);

  const handleCreateConversation = () => {
    setActive(null);
    props.navigation.navigate('Chat');
    props.navigation.closeDrawer();
  };

  const handleSelect = (id: string) => {
    setActive(id);
    props.navigation.navigate('Chat');
    props.navigation.closeDrawer();
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Conversation',
      'This conversation will be permanently deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteConversation(id);
            clearConversationDraft(id);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.brand}>ChatKnot</Text>
        <TouchableOpacity style={styles.newChatButton} onPress={handleCreateConversation} accessibilityLabel="Start new chat" accessibilityRole="button">
          <PlusCircle size={20} color={colors.onPrimary} />
          <Text style={styles.newChatText}>{newChatLabel}</Text>
        </TouchableOpacity>
      </View>

      {conversations.length > SEARCH_BAR_MIN_CONVERSATIONS && (
        <View style={styles.searchBar}>
          <Search size={15} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor={colors.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            accessibilityLabel="Search conversations"
            accessibilityRole="search"
          />
        </View>
      )}

      <FlatList
        data={filteredConversations}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              {searchQuery.trim() ? 'No conversations found.' : 'No conversations yet.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const conversationLabel = getSidebarConversationLabel(item);
          return (
          <TouchableOpacity
            style={[styles.item, item.id === activeId ? styles.activeItem : undefined]}
            onPress={() => handleSelect(item.id)}
            accessibilityLabel={`Open conversation: ${conversationLabel}`}
            accessibilityRole="button"
          >
            <View style={styles.itemMain}>
              <MessageSquare size={17} color={item.id === activeId ? colors.primary : colors.textTertiary} />
              <Text
                style={[styles.itemText, item.id === activeId ? styles.activeItemText : undefined]}
                numberOfLines={1}
              >
                {conversationLabel}
              </Text>
            </View>
            <TouchableOpacity
              onPress={(event) => handleDeleteConversationPress(event, item.id, handleDelete)}
              style={styles.deleteBtn}
              accessibilityLabel={`Delete conversation: ${conversationLabel}`}
              accessibilityRole="button"
            >
              <Trash2 size={15} color={colors.textTertiary} />
            </TouchableOpacity>
          </TouchableOpacity>
          );
        }}
      />

      <View style={styles.footer}>
        <TouchableOpacity style={styles.settingsButton} onPress={() => props.navigation.navigate('Settings')} accessibilityLabel="Open settings" accessibilityRole="button">
          <SettingsIcon size={18} color={colors.text} />
          <Text style={styles.settingsText}>Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors: AppPalette) =>
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
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.inputBackground,
      marginHorizontal: 10,
      marginTop: 8,
      marginBottom: 2,
      paddingHorizontal: 10,
      borderRadius: 10,
      height: 38,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      marginLeft: 8,
      fontSize: 13,
      paddingVertical: 0,
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
