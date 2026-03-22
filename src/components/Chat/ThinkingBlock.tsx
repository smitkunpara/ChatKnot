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
import { useAppTheme, AppPalette } from '../../theme/useAppTheme';
import Markdown from 'react-native-markdown-display';
import { ShinyText } from '../Common/ShinyText';
import {
    createMarkdownStyles,
    createTableRenderRules,
    getTableColumnWidth,
} from './chatMarkdownStyles';

interface ThinkingBlockProps {
    /** The raw thinking text (content between <think> tags). */
    content: string;
    /** True while the model is still streaming this thinking block. */
    isStreaming: boolean;
    /** Persisted duration in milliseconds for finished thoughts. */
    durationMs?: number;
}

/** Format elapsed milliseconds into a clean string like "0.4s" or "32.1s" */
export const formatDuration = (totalMs: number): string => {
    if (totalMs === 0) return '';
    if (totalMs < 1000) return `${totalMs}ms`;
    const totalSeconds = totalMs / 1000;
    if (totalSeconds < 60) {
        return `${Math.max(0, totalSeconds).toFixed(1)}s`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${Math.floor(seconds)}s`;
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
export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
    content,
    isStreaming,
    durationMs,
}) => {
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
    const [elapsedMs, setElapsedMs] = useState(0);
    const startTimeRef = useRef<number>(Date.now());

    useEffect(() => {
        if (isStreaming) {
            startTimeRef.current = Date.now();
            setElapsedMs(0);
            const interval = setInterval(() => {
                setElapsedMs(Date.now() - startTimeRef.current);
            }, 100);
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
    const durationText = formatDuration(isStreaming ? elapsedMs : (durationMs ?? 0));

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={styles.header}
                onPress={() => setExpanded(prev => !prev)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={expanded ? 'Collapse thinking' : 'Expand thinking'}
            >
                {/* Left side shimmers/shines — chevron stays fully opaque always */}
                <Animated.View style={[styles.headerInner, isStreaming ? { opacity: shimmerAnim } : {}]}>
                    <Brain size={14} color={colors.primary} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {isStreaming ? (
                            <ShinyText
                                text={durationText ? `Thinking ${durationText}` : 'Thinking…'}
                                color={colors.textSecondary}
                                shineColor={colors.text}
                                style={styles.headerText}
                                speed={1.5}
                            />
                        ) : (
                            <>
                                <Text style={styles.headerText}>Thought</Text>
                                <Text style={styles.durationText}>
                                    {durationText || 'N/A'}
                                </Text>
                            </>
                        )}
                    </View>
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
            color: colors.text,
            fontSize: 13,
            fontWeight: '600',
        },
        durationText: {
            color: colors.textTertiary,
            fontSize: 12,
            marginLeft: 0,
        },
        body: {
            paddingHorizontal: 12,
            paddingTop: 0,
            paddingBottom: 10,
        },
    });
