import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, SafeAreaView } from 'react-native';
import { useChatStore } from '../../store/useChatStore';
import { PlusCircle, Trash2, Settings as SettingsIcon, MessageSquare } from 'lucide-react-native';
import { DrawerContentComponentProps } from '@react-navigation/drawer';

export const Sidebar: React.FC<DrawerContentComponentProps> = (props) => {
  const conversations = useChatStore(state => state.conversations);
  const activeId = useChatStore(state => state.activeConversationId);
  const setActive = useChatStore(state => state.setActiveConversation);
  const createNew = useChatStore(state => state.createConversation);
  const deleteConversation = useChatStore(state => state.deleteConversation);

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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
         <TouchableOpacity 
          style={styles.newChatButton} 
          onPress={() => {
            createNew('openai', 'You are a helpful assistant.');
            props.navigation.navigate('Chat');
            props.navigation.closeDrawer();
          }}
        >
          <PlusCircle size={20} color="#fff" />
          <Text style={styles.newChatText}>New Chat</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={[styles.item, item.id === activeId && styles.activeItem]}
            onPress={() => handleSelect(item.id)}
          >
            <View style={styles.itemMain}>
              <MessageSquare size={18} color={item.id === activeId ? '#007AFF' : '#888'} />
              <Text style={[styles.itemText, item.id === activeId && styles.activeItemText]} numberOfLines={1}>
                {item.title || 'New Chat'}
              </Text>
            </View>
            <TouchableOpacity onPress={(e) => handleDelete(item.id, e)} style={styles.deleteBtn}>
              <Trash2 size={16} color="#444" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />

      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.settingsButton} 
          onPress={() => props.navigation.navigate('Settings')}
        >
          <SettingsIcon size={20} color="#fff" />
          <Text style={styles.settingsText}>Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#171717',
  },
  header: {
    padding: 15,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#2e2e2e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3e3e3e',
  },
  newChatText: {
    color: '#fff',
    marginLeft: 10,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 10,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginVertical: 2,
  },
  itemMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  activeItem: {
    backgroundColor: '#2a2a2a',
  },
  itemText: {
    color: '#aaa',
    marginLeft: 10,
    fontSize: 14,
    flex: 1,
  },
  activeItemText: {
    color: '#fff',
    fontWeight: '500',
  },
  deleteBtn: {
    padding: 5,
  },
  footer: {
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
  },
  settingsText: {
    color: '#fff',
    marginLeft: 10,
    fontSize: 16,
    fontWeight: '500',
  },
});
