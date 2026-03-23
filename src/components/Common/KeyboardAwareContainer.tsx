import React from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';

interface KeyboardAwareContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  keyboardVerticalOffset?: number;
}

export const KeyboardAwareContainer = ({
  children,
  style,
  contentContainerStyle,
  keyboardVerticalOffset = 0,
}: KeyboardAwareContainerProps) => {
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior="height"
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <ScrollView
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
