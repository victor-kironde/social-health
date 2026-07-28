import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { NODE_RADIUS } from '../layout';
import { ME_ID, encode, type GraphRendererProps } from '../model';

/**
 * react-native-svg renderer: one native view per element. Simple and
 * accessible to inspect, but slow to mount for large graphs.
 */
export function SvgRenderer({ data, positions, size, fit, view, style, onRendered }: GraphRendererProps) {
  const c = style.colours;

  // Pan/zoom as a native view transform about the centre; the SVG itself never re-renders.
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: view.tx.value }, { translateY: view.ty.value }, { scale: view.scale.value }],
  }));

  const content = useMemo(
    () => (
      <>
        <G>
          {data.edges.map((e) => {
            const a = e.source === ME_ID ? { x: 0, y: 0 } : positions.get(e.source)!;
            const b = positions.get(e.target)!;
            return (
              <Line
                key={e.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={encode.edgeColour(e, style)}
                strokeWidth={encode.edgeWidth(e.importance)}
                strokeOpacity={encode.edgeOpacity(e.behind)}
              />
            );
          })}
        </G>
        <G>
          {data.nodes.map((n) => {
            const p = positions.get(n.id)!;
            return (
              <G key={n.id} opacity={encode.nodeOpacity(n.behind)}>
                <Circle cx={p.x} cy={p.y} r={NODE_RADIUS} fill={c.card} stroke={c.category[n.category]} strokeWidth={4} />
                <SvgText x={p.x} y={p.y + 5} fontSize={14} fontWeight="600" fill={c.text} textAnchor="middle">
                  {encode.initial(n.label)}
                </SvgText>
                {style.showLabels && (
                  <SvgText x={p.x} y={p.y + NODE_RADIUS + 13} fontSize={10} fill={c.muted} textAnchor="middle">
                    {encode.shortLabel(n.label)}
                  </SvgText>
                )}
              </G>
            );
          })}
          <Circle cx={0} cy={0} r={NODE_RADIUS + 4} fill={c.accent} />
          <SvgText x={0} y={5} fontSize={13} fontWeight="700" fill={c.onAccent} textAnchor="middle">
            You
          </SvgText>
        </G>
      </>
    ),
    [data, positions, style, c],
  );

  useEffect(() => onRendered?.(), [content, onRendered]);

  const viewBox = `${-size.width / 2 / fit} ${-size.height / 2 / fit} ${size.width / fit} ${size.height / fit}`;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
      <Svg width={size.width} height={size.height} viewBox={viewBox}>
        {content}
      </Svg>
    </Animated.View>
  );
}
