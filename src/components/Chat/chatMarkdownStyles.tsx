import React from 'react';
import { ScrollView, View, TextStyle, ViewStyle } from 'react-native';
import type { ASTNode, RenderRules } from 'react-native-markdown-display';
import { AppPalette } from '../../theme/useAppTheme';

export type MarkdownStyles = {
  body: TextStyle;
  heading1: TextStyle;
  heading2: TextStyle;
  heading3: TextStyle;
  heading4: TextStyle;
  heading5: TextStyle;
  heading6: TextStyle;
  paragraph: TextStyle;
  text: TextStyle;
  strong: TextStyle;
  em: TextStyle;
  s: TextStyle;
  hr: ViewStyle;
  code_inline: TextStyle;
  code_block: TextStyle;
  fence: TextStyle;
  pre: ViewStyle;
  link: TextStyle;
  blockquote: ViewStyle;
  bullet_list_icon: TextStyle;
  ordered_list_icon: TextStyle;
  list_item: TextStyle;
  bullet_list: TextStyle;
  ordered_list: TextStyle;
  list_item_content: TextStyle;
  table: ViewStyle;
  thead: ViewStyle;
  tbody: ViewStyle;
  tr: ViewStyle;
  th: ViewStyle;
  td: ViewStyle;
};

export type TableRenderRules = Pick<RenderRules, 'table' | 'th' | 'td' | 'tr'>;

export const getTableColumnWidth = (viewportWidth: number) =>
  Math.max(140, Math.min(Math.floor((viewportWidth - 96) / 2), 220));

export const createMarkdownStyles = (colors: AppPalette): MarkdownStyles => ({
  body: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
    flexShrink: 1,
  },
  heading1: {
    color: colors.text,
    marginVertical: 4,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
  },
  heading2: {
    color: colors.text,
    marginVertical: 4,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700' as const,
  },
  heading3: {
    color: colors.text,
    marginVertical: 4,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700' as const,
  },
  heading4: {
    color: colors.text,
    marginVertical: 4,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600' as const,
  },
  heading5: {
    color: colors.text,
    marginVertical: 4,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as const,
  },
  heading6: {
    color: colors.text,
    marginVertical: 4,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600' as const,
  },
  paragraph: {
    color: colors.text,
    marginTop: 4,
    marginBottom: 4,
    flexWrap: 'wrap' as const,
  },
  text: {
    color: colors.text,
  },
  strong: {
    fontWeight: '700' as const,
  },
  em: {
    fontStyle: 'italic',
  },
  s: {
    textDecorationLine: 'line-through',
  },
  hr: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 12,
  },
  code_inline: {
    backgroundColor: colors.codeBackground,
    color: colors.text,
    fontFamily: 'monospace',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  code_block: {
    backgroundColor: colors.codeBackground,
    color: colors.text,
    fontFamily: 'monospace',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fence: {
    backgroundColor: colors.codeBackground,
    color: colors.text,
    borderColor: colors.border,
    borderWidth: 1,
    fontFamily: 'monospace',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
    overflow: 'hidden' as const,
  },
  pre: {
    backgroundColor: colors.codeBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 0,
    marginVertical: 4,
    overflow: 'hidden' as const,
  },
  link: {
    color: colors.link,
  },
  blockquote: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.primary,
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginVertical: 4,
  },
  bullet_list_icon: {
    color: colors.text,
    marginTop: 2,
    marginRight: 8,
  },
  ordered_list_icon: {
    color: colors.textSecondary,
    marginRight: 8,
  },
  list_item: {
    color: colors.text,
    marginBottom: 4,
  },
  bullet_list: {
    color: colors.text,
    marginBottom: 4,
  },
  ordered_list: {
    color: colors.text,
    marginBottom: 4,
  },
  list_item_content: {
    color: colors.text,
    flex: 1,
  },
  table: {
    borderWidth: 0,
    borderColor: 'transparent',
    marginVertical: 4,
  },
  thead: {},
  tbody: {},
  tr: {
    borderBottomWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row' as const,
  },
  th: {
    padding: 8,
    borderRightWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignSelf: 'stretch' as const,
  },
  td: {
    padding: 8,
    borderRightWidth: 1,
    borderColor: colors.border,
    alignSelf: 'stretch' as const,
  },
});

export const createTableRenderRules = (colors: AppPalette, columnWidth: number): TableRenderRules => ({
  table: (node: ASTNode, children: React.ReactNode[]) => (
    <ScrollView
      key={node.key}
      horizontal
      showsHorizontalScrollIndicator={true}
      contentContainerStyle={{
        flexDirection: 'column' as const,
      }}
      style={{
        marginVertical: 4,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 6,
        maxWidth: '100%' as const,
        alignSelf: 'flex-start' as const,
      }}
    >
      {children}
    </ScrollView>
  ),
  th: (node: ASTNode, children: React.ReactNode[]) => (
    <View
      key={node.key}
      style={{
        padding: 8,
        width: columnWidth,
        maxWidth: columnWidth,
        borderRightWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceAlt,
        alignSelf: 'stretch' as const,
      }}
    >
      <View style={{ width: '100%', flexShrink: 1 }}>
        {children}
      </View>
    </View>
  ),
  td: (node: ASTNode, children: React.ReactNode[]) => (
    <View
      key={node.key}
      style={{
        padding: 8,
        width: columnWidth,
        maxWidth: columnWidth,
        borderRightWidth: 1,
        borderColor: colors.border,
        alignSelf: 'stretch' as const,
      }}
    >
      <View style={{ width: '100%', flexShrink: 1 }}>
        {children}
      </View>
    </View>
  ),
  tr: (node: ASTNode, children: React.ReactNode[]) => (
    <View
      key={node.key}
      style={{
        flexDirection: 'row' as const,
        borderBottomWidth: 1,
        borderColor: colors.border,
        alignItems: 'stretch' as const,
      }}
    >
      {children}
    </View>
  ),
});
