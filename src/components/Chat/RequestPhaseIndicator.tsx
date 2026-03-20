import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { ChevronDown, ChevronUp, Loader, Zap } from 'lucide-react-native';
import { useAppTheme, AppPalette } from '../../theme/useAppTheme';
import { RequestPhase } from '../../store/useChatRuntimeStore';
import { ApiRequestDetails } from '../../types';

interface RequestPhaseIndicatorProps {
    phase: RequestPhase;
    /** Live API request details — populated when phase is 'api_request'. */
    apiRequestDetails: ApiRequestDetails | null;
}

/** Format elapsed milliseconds into a human-readable string, e.g. "1.2s", "450ms". */
const formatElapsed = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
};

const SpinnerIcon = ({ color, size = 14 }: { color: string; size?: number }) => {
    const rotation = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.timing(rotation, {
                toValue: 1,
                duration: 900,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );
        loop.start();
        return () => loop.stop();
    }, [rotation]);

    const spin = rotation.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    return (
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Loader size={size} color={color} />
        </Animated.View>
    );
};

/**
 * Renders the per-phase streaming status indicator shown above the assistant text.
 *
 * Phase flow:
 *   generating_query  →  api_request  →  (thinking handled by ThinkingBlock)  →  null (text streams)
 *
 * - generating_query: non-expandable, shimmering spinner + label
 * - api_request: expandable, shows model, provider URL, elapsed timer
 */
export const RequestPhaseIndicator: React.FC<RequestPhaseIndicatorProps> = ({
    phase,
    apiRequestDetails,
}) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    // ---- Shimmer animation (opacity pulse) while any phase is active ----
    const shimmerAnim = useRef(new Animated.Value(0.5)).current;
    useEffect(() => {
        if (phase) {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(shimmerAnim, {
                        toValue: 1,
                        duration: 750,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(shimmerAnim, {
                        toValue: 0.5,
                        duration: 750,
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
    }, [phase, shimmerAnim]);

    // ---- Elapsed timer for api_request phase ----
    const [elapsedMs, setElapsedMs] = useState(0);
    const timerStartRef = useRef<number>(0);

    useEffect(() => {
        if (phase === 'api_request' && apiRequestDetails) {
            timerStartRef.current = apiRequestDetails.requestedAt;
            setElapsedMs(Date.now() - timerStartRef.current);
            const interval = setInterval(() => {
                setElapsedMs(Date.now() - timerStartRef.current);
            }, 100);
            return () => clearInterval(interval);
        }
    }, [phase, apiRequestDetails]);

    // ---- Expand/collapse for api_request ----
    const [expanded, setExpanded] = useState(false);

    // Auto-collapse when phase changes away from api_request
    useEffect(() => {
        if (phase !== 'api_request') {
            setExpanded(false);
        }
        // Reset elapsed when entering api_request
        if (phase === 'api_request') {
            setElapsedMs(0);
        }
    }, [phase]);

    if (!phase || phase === 'thinking') return null;

    if (phase === 'generating_query') {
        return (
            <View style={styles.container}>
                <Animated.View style={[styles.row, { opacity: shimmerAnim }]}>
                    <SpinnerIcon color={colors.primary} size={13} />
                    <Text style={styles.labelText}>Generating query…</Text>
                </Animated.View>
            </View>
        );
    }

    // api_request phase
    const ChevronIcon = expanded ? ChevronUp : ChevronDown;
    const elapsedText = formatElapsed(elapsedMs);

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={styles.row}
                onPress={() => setExpanded(prev => !prev)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={expanded ? 'Collapse API request details' : 'Expand API request details'}
            >
                <Animated.View style={[styles.rowInner, { opacity: shimmerAnim }]}>
                    <Zap size={13} color={colors.primary} />
                    <Text style={styles.labelText}>API Request</Text>
                    <Text style={styles.elapsedText}>{elapsedText}</Text>
                </Animated.View>
                <ChevronIcon size={13} color={colors.textTertiary} />
            </TouchableOpacity>

            {expanded && apiRequestDetails && (
                <View style={styles.detailsContainer}>
                    <DetailRow label="Model" value={apiRequestDetails.model} colors={colors} />
                    <DetailRow label="Provider" value={apiRequestDetails.providerUrl} colors={colors} />
                    {apiRequestDetails.responseStatus !== undefined && (
                        <DetailRow
                            label="Status"
                            value={String(apiRequestDetails.responseStatus)}
                            colors={colors}
                            isStatus
                            statusOk={(apiRequestDetails.responseStatus ?? 0) < 400}
                        />
                    )}
                    {apiRequestDetails.firstChunkAt !== undefined && (
                        <DetailRow
                            label="First chunk"
                            value={formatElapsed(apiRequestDetails.firstChunkAt - apiRequestDetails.requestedAt)}
                            colors={colors}
                        />
                    )}
                </View>
            )}
        </View>
    );
};

interface DetailRowProps {
    label: string;
    value: string;
    colors: AppPalette;
    isStatus?: boolean;
    statusOk?: boolean;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value, colors, isStatus, statusOk }) => {
    const valueColor = isStatus
        ? (statusOk ? colors.success : colors.danger)
        : colors.text;

    return (
        <View style={{ flexDirection: 'row', marginBottom: 4, gap: 6 }}>
            <Text style={{ fontSize: 11, color: colors.textTertiary, minWidth: 58 }}>{label}</Text>
            <Text style={{ fontSize: 11, color: valueColor, flex: 1, flexWrap: 'wrap' }} numberOfLines={2}>
                {value}
            </Text>
        </View>
    );
};

const createStyles = (colors: AppPalette) =>
    StyleSheet.create({
        container: {
            marginBottom: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceAlt,
            overflow: 'hidden',
            paddingHorizontal: 10,
            paddingVertical: 7,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        rowInner: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            flex: 1,
        },
        labelText: {
            color: colors.text,
            fontSize: 12,
            fontWeight: '600',
        },
        elapsedText: {
            color: colors.textTertiary,
            fontSize: 11,
            marginLeft: 4,
        },
        detailsContainer: {
            marginTop: 8,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
    });
