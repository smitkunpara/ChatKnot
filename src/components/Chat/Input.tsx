// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Keyboard, Platform } from 'react-native';
import { Send, StopCircle, X } from 'lucide-react-native';

interface InputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  onStop: () => void;
  initialValue?: string;
  onCancelEdit?: () => void;
  isEditing?: boolean;
}

export const Input: React.FC<InputProps> = ({ onSend, isLoading, onStop, initialValue, onCancelEdit, isEditing }) => {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (initialValue !== undefined) {
      setText(initialValue);
      if (initialValue) {
        // Focus and open keyboard when editing starts
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  }, [initialValue]);

  const handleSend = () => {
    if (text.trim()) {
      onSend(text);
      setText('');
    }
  };

  return (
    <View style={styles.container}>
      {isEditing && (
        <TouchableOpacity style={styles.cancelBtn} onPress={() => { setText(''); onCancelEdit?.(); }}>
          <X size={16} color="#ff4444" />
        </TouchableOpacity>
      )}
      <TextInput
        ref={inputRef}
        style={[styles.input, isEditing && styles.editingInput]}
        placeholder={isEditing ? "Edit message..." : "Type a message..."}
        placeholderTextColor="#888"
        value={text}
        onChangeText={setText}
        multiline
        textAlignVertical="top"
      />
      <TouchableOpacity 
        style={[styles.button, { backgroundColor: isLoading ? '#ff4444' : (isEditing ? '#F2994A' : '#007AFF') }]} 
        onPress={isLoading ? onStop : handleSend}
        disabled={!text.trim() && !isLoading}
      >
        {isLoading ? (
          <StopCircle color="white" size={20} />
        ) : (
          <Send color="white" size={20} />
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    paddingBottom: Platform.OS === 'ios' ? 25 : 10,
    borderTopWidth: 1,
    borderTopColor: '#222',
    backgroundColor: '#121212',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 10,
    color: '#fff',
    fontSize: 15,
    marginRight: 8,
  },
  editingInput: {
    borderColor: '#F2994A',
    borderWidth: 1,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    padding: 10,
    justifyContent: 'center',
  }
});
