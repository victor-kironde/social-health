import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { scoreBand, scoreOutOf10 } from '../data/health';
import { useTheme } from './theme';

/**
 * The Social Health score as a number from 1 to 10 inside a ring that fills up to it, coloured
 * like relationship health (red for low, green for high).
 */
export function ScoreRing({ total, size = 56, stroke }: { total: number; size?: number; stroke?: number }) {
  const t = useTheme();
  const score = scoreOutOf10(total);
  const colour = t.health[scoreBand(score)];
  const width = stroke ?? Math.max(4, size / 10);
  const r = (size - width) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityLabel={`Social Health ${score} out of 10`}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.track} strokeWidth={width} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colour}
          strokeWidth={width}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(circumference * score) / 10} ${circumference}`}
          // Start at the top and fill clockwise.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={{ color: t.text, fontSize: size * 0.38, fontWeight: '800' }}>{score}</Text>
    </View>
  );
}
