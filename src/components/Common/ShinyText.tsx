import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextStyle,
  View,
} from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';

interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string; // Kept for compatibility with user snippet, but unused in native
  style?: TextStyle;
  color?: string;
  shineColor?: string;
  spread?: number;
}

/**
 * A React Native implementation of a "Shiny" text effect.
 * Uses a LinearGradient inside a MaskedView to simulate the moving shine.
 */
export const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  disabled = false,
  speed = 2,
  style,
  color = '#b5b5b5',
  shineColor = '#ffffff',
  spread = 120,
}) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (disabled) {
      animatedValue.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: speed * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    animation.start();
    return () => animation.stop();
  }, [disabled, speed, animatedValue]);

  // Translate the gradient from left to right (-100% to 100% width)
  // We make the gradient wider than the text container (e.g. 200%)
  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200], // Adjust based on width if needed, but 200 is a safe guess for standard labels
  });

  const gradientColors = useMemo(
    () => [color, color, shineColor, color, color] as [string, string, string, string, string],
    [color, shineColor]
  );
  
  const locations = useMemo(() => [0, 0.35, 0.5, 0.65, 1] as [number, number, number, number, number], []);

  if (disabled) {
    return <Text style={[style, { color }]}>{text}</Text>;
  }

  return (
    <View style={style}>
        {/* Helper text to drive the width/height of the container */}
        <Text style={[style, { color: 'transparent' }]} numberOfLines={1}>{text}</Text>
        
        <MaskedView
            style={StyleSheet.absoluteFill}
            maskElement={
                <Text style={style} numberOfLines={1}>
                    {text}
                </Text>
            }
        >
            <View style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />
            <Animated.View
                style={[
                    StyleSheet.absoluteFill,
                    {
                        transform: [{ translateX }],
                        width: '350%', // Wide sweep
                        left: '-125%',
                    },
                ]}
            >
                <LinearGradient
                    colors={gradientColors}
                    locations={locations}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>
        </MaskedView>
    </View>
  );
};

const styles = StyleSheet.create({
});
