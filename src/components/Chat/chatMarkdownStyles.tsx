import React from 'react';
import { ScrollView, View } from 'react-native';
import { AppPalette } from '../../theme/useAppTheme';

export const getTableColumnWidth = (viewportWidth: number) =>
  Math.max(140, Math.min(Math.floor((viewportWidth - 96) / 2), 220));

export const createMarkdownStyles = (colors: AppPalette) => ({
  body: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
    flexShrink: 1,
  },
  heading1: {
    color: colors.text,
    marginTop: 4,
    marginBottom: 10,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
  },
  heading2: {
    color: colors.text,
    marginTop: 4,
    marginBottom: 10,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700' as const,
  },
  heading3: {
    color: colors.text,
    marginTop: 4,
    marginBottom: 8,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700' as const,
  },
  heading4: {
    color: colors.text,
    marginTop: 2,
    marginBottom: 8,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600' as const,
  },
  heading5: {
    color: colors.text,
    marginBottom: 6,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as const,
  },
  heading6: {
    color: colors.text,
    marginBottom: 6,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600' as const,
  },
  paragraph: {
    color: colors.text,
    marginTop: 0,
    marginBottom: 10,
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
    marginVertical: 8,
    overflow: 'hidden' as const,
  },
  pre: {
    backgroundColor: colors.codeBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 0,
    marginVertical: 8,
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
    marginVertical: 6,
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
    marginBottom: 6,
  },
  bullet_list: {
    color: colors.text,
    marginBottom: 10,
  },
  ordered_list: {
    color: colors.text,
    marginBottom: 10,
  },
  list_item_content: {
    color: colors.text,
    flex: 1,
  },
  table: {
    borderWidth: 0,
    borderColor: 'transparent',
    marginVertical: 8,
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

export const createTableRenderRules = (colors: AppPalette, columnWidth: number) => ({
  table: (node: any, children: any) => (
    <ScrollView
      key={node.key}
      horizontal
      showsHorizontalScrollIndicator={true}
      contentContainerStyle={{
        flexDirection: 'column' as const,
      }}
      style={{
        marginVertical: 8,
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
  th: (node: any, children: any) => (
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
  td: (node: any, children: any) => (
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
  tr: (node: any, children: any) => (
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
