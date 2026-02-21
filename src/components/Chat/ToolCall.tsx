import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ChevronDown, ChevronUp, Box, CheckCircle, AlertCircle } from 'lucide-react-native';
import { ToolCall as ToolCallType } from '../../types';

interface ToolCallProps {
  toolCall: ToolCallType;
}

export const ToolCall: React.FC<ToolCallProps> = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false);

  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'running':
      case 'pending':
        return <ActivityIndicator size="small" color="#007AFF" />;
      case 'completed':
        return <CheckCircle size={16} color="#4CAF50" />;
      case 'failed':
        return <AlertCircle size={16} color="#F44336" />;
      default:
        return <Box size={16} color="#888" />;
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.header} 
        onPress={() => setExpanded(!expanded)}
      >
        <View style={styles.titleRow}>
          {getStatusIcon()}
          <Text style={styles.toolName}>Using: {toolCall.name}</Text>
        </View>
        {expanded ? <ChevronUp size={16} color="#888" /> : <ChevronDown size={16} color="#888" />}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.details}>
          <Text style={styles.label}>Arguments:</Text>
          <Text style={styles.code}>{toolCall.arguments}</Text>
          
          {toolCall.result && (
            <>
              <Text style={styles.label}>Result:</Text>
              <Text style={styles.code}>{toolCall.result}</Text>
            </>
          )}
           {toolCall.error && (
            <>
              <Text style={[styles.label, { color: '#ff4444' }]}>Error:</Text>
              <Text style={styles.code}>{toolCall.error}</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#252525',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolName: {
    color: '#ddd',
    fontWeight: '600',
    fontSize: 14,
  },
  details: {
    padding: 10,
    backgroundColor: '#1a1a1a',
  },
  label: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 2,
    fontWeight: 'bold',
  },
  code: {
    fontFamily: 'monospace',
    color: '#ccc',
    fontSize: 12,
    backgroundColor: '#111',
    padding: 6,
    borderRadius: 4,
  },
});
