import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { ChevronDown, ChevronUp, Check } from 'lucide-react-native';
import { useAppTheme, AppPalette } from '../../theme/useAppTheme';
import { RequestPhase } from '../../store/useChatRuntimeStore';
import { ApiRequestDetails } from '../../types';

interface RequestPhaseIndicatorProps {
    phase?: RequestPhase | null;
    /** Live API request details — populated when phase is 'api_request'. */
    apiRequestDetails: ApiRequestDetails | null;
}

/** Format elapsed milliseconds into a human-readable string, e.g. "1.2s", "450ms". */
const formatElapsed = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
};

const SpinnerIcon = ({ color }: { color: string }) => {
    return <ActivityIndicator size="small" color={color} />;
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

    // ---- Elapsed timer for api_request phase ----
    const [elapsedMs, setElapsedMs] = useState(0);
    const timerStartRef = useRef<number>(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (phase === 'api_request' && apiRequestDetails) {
            timerStartRef.current = apiRequestDetails.requestedAt;
            setElapsedMs(Date.now() - timerStartRef.current);
            intervalRef.current = setInterval(() => {
                setElapsedMs(Date.now() - timerStartRef.current);
            }, 100);
        }
        
        return () => {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [phase, apiRequestDetails]);

    // ---- Expand/collapse for api_request ----
    const [expanded, setExpanded] = useState(false);

    // Auto-collapse when phase changes away from api_request
    useEffect(() => {
        if (phase !== 'api_request' && phase !== 'generating_query') {
            setExpanded(false);
        }
        // Reset elapsed when entering api_request
        if (phase === 'api_request') {
            setElapsedMs(0);
        }
    }, [phase]);

    if (!phase && !apiRequestDetails) return null;

    if (phase === 'generating_query') {
        return (
            <View style={styles.container}>
                <View style={styles.row}>
                    <View style={styles.rowInner}>
                        <SpinnerIcon color={colors.primary} />
                        <Text style={styles.labelText}>Generating query…</Text>
                    </View>
                </View>
            </View>
        );
    }

    if (!apiRequestDetails) return null;

    const isActive = phase === 'api_request';
    const ChevronIcon = expanded ? ChevronUp : ChevronDown;

    // Show live timer if active, otherwise show final duration if we have firstChunkAt
    let displayTime = '';
    if (isActive) {
        displayTime = formatElapsed(elapsedMs);
    } else if (apiRequestDetails.firstChunkAt) {
        displayTime = formatElapsed(apiRequestDetails.firstChunkAt - apiRequestDetails.requestedAt);
    }

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={styles.row}
                onPress={() => setExpanded(prev => !prev)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={expanded ? 'Collapse API request details' : 'Expand API request details'}
            >
                <View style={styles.rowInner}>
                    {isActive ? (
                        <SpinnerIcon color={colors.primary} />
                    ) : (
                        <Check size={14} color={colors.success} />
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.labelText}>API Request</Text>
                        <Text style={[styles.elapsedText, !isActive && { opacity: 0.5 }]}>
                            {displayTime || (isActive ? '' : 'N/A')}
                        </Text>
                    </View>
                </View>
                <ChevronIcon size={14} color={colors.textTertiary} />
            </TouchableOpacity>

            {expanded && apiRequestDetails && (
                <View style={styles.detailsContainer}>
                    <DetailRow label="Model" value={apiRequestDetails.model} colors={colors} />
                    {apiRequestDetails.modeName && (
                        <DetailRow label="Mode" value={apiRequestDetails.modeName} colors={colors} />
                    )}
                    <DetailRow label="Provider" value={apiRequestDetails.providerUrl} colors={colors} />
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
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceAlt,
            overflow: 'hidden',
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 10,
            paddingVertical: 8,
        },
        rowInner: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            flex: 1,
        },
        labelText: {
            color: colors.text,
            fontSize: 13,
            fontWeight: '600',
        },
        elapsedText: {
            color: colors.textTertiary,
            fontSize: 12,
            marginLeft: 0,
        },
        detailsContainer: {
            marginTop: 8,
            paddingTop: 8,
            paddingHorizontal: 10,
            paddingBottom: 8,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
    });
