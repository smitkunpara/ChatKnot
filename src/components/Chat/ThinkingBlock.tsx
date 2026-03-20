import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { ChevronDown, ChevronUp, Brain } from 'lucide-react-native';
import Markdown from 'react-native-markdown-display';
import { useAppTheme, AppPalette } from '../../theme/useAppTheme';
import {
    createMarkdownStyles,
    createTableRenderRules,
    getTableColumnWidth,
} from './MessageBubble';

interface ThinkingBlockProps {
    /** The raw thinking text (content between <think> tags). */
    content: string;
    /** True while the model is still streaming this thinking block. */
    isStreaming: boolean;
}

/** Format elapsed seconds into a human-readable duration, e.g. "3s", "1m 23s". */
const formatDuration = (totalSeconds: number): string => {
    if (totalSeconds < 1) return '';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
};

/**
 * Renders a collapsible "Thinking" section.
 *
 * While streaming:
 *  - Shows a shimmering "Thinking…" / "Thinking for Xs" label (left side only – chevron is stable)
 *  - Auto-expands so the user can watch reasoning appear
 *  - Counts elapsed thinking time
 *
 * Once done:
 *  - Collapses, shows "Thought for Xs"
 *  - User can tap to expand/collapse
 *  - No shimmer animation
 */
export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ content, isStreaming }) => {
    const { colors } = useAppTheme();
    const { width: viewportWidth } = useWindowDimensions();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const markdownStyles = useMemo(() => createMarkdownStyles(colors) as any, [colors]);
    const tableRenderRules = useMemo(
        () => createTableRenderRules(colors, getTableColumnWidth(viewportWidth)),
        [colors, viewportWidth]
    );

    // Auto-expand while streaming, auto-collapse once done.
    const [expanded, setExpanded] = useState(isStreaming);
    const prevStreamingRef = useRef(isStreaming);

    useEffect(() => {
        if (isStreaming && !prevStreamingRef.current) {
            setExpanded(true);
        }
        if (prevStreamingRef.current && !isStreaming) {
            setExpanded(false);
        }
        prevStreamingRef.current = isStreaming;
    }, [isStreaming]);

    // ---- Elapsed time tracking ----
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const startTimeRef = useRef<number>(Date.now());

    useEffect(() => {
        if (isStreaming) {
            startTimeRef.current = Date.now();
            setElapsedSeconds(0);
            const interval = setInterval(() => {
                setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [isStreaming]);

    // ---- Shimmer animation (opacity pulse) only while streaming ----
    // Applied only to the label + brain icon (left side), NOT to the chevron.
    const shimmerAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (isStreaming) {
            shimmerAnim.setValue(0.55);
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(shimmerAnim, {
                        toValue: 1,
                        duration: 800,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(shimmerAnim, {
                        toValue: 0.55,
                        duration: 800,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ])
            );
            loop.start();
            return () => loop.stop();
        } else {
            shimmerAnim.setValue(1);
        }
    }, [isStreaming, shimmerAnim]);

    const ChevronIcon = expanded ? ChevronUp : ChevronDown;
    const durationText = formatDuration(elapsedSeconds);

    // Header label: while streaming show "Thinking…" or "Thinking for Xs"; when done "Thought for Xs"
    const headerLabel = isStreaming
        ? `Thinking${durationText ? ` for ${durationText}` : '…'}`
        : `Thought${durationText ? ` for ${durationText}` : ''}`;

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={styles.header}
                onPress={() => setExpanded(prev => !prev)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={expanded ? 'Collapse thinking' : 'Expand thinking'}
            >
                {/* Only the left side shimmers — chevron stays fully opaque always */}
                <Animated.View style={[styles.headerInner, { opacity: shimmerAnim }]}>
                    <Brain size={14} color={colors.primary} />
                    <Text style={[styles.headerText, isStreaming && styles.headerTextStreaming]}>
                        {headerLabel}
                    </Text>
                </Animated.View>
                {/* Chevron: always opaque, always visible */}
                <ChevronIcon size={14} color={colors.textSecondary} />
            </TouchableOpacity>

            {expanded && content.trim().length > 0 && (
                <View style={styles.body}>
                    <Markdown
                        style={markdownStyles}
                        rules={tableRenderRules}
                    >
                        {content}
                    </Markdown>
                </View>
            )}
        </View>
    );
};

const createStyles = (colors: AppPalette) =>
    StyleSheet.create({
        container: {
            marginBottom: 8,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceAlt,
            overflow: 'hidden',
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 10,
            paddingVertical: 8,
        },
        headerInner: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            flex: 1,
        },
        headerText: {
            color: colors.textSecondary,
            fontSize: 13,
            fontWeight: '600',
        },
        /** Brighter label while actively streaming so it reads clearly against the background. */
        headerTextStreaming: {
            color: colors.text,
        },
        body: {
            paddingHorizontal: 12,
            paddingTop: 0,
            paddingBottom: 10,
        },
    });
