import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { HEALTH_LABELS, scoreBand, scoreOutOf10 } from '../data/health';
import { BAND_ORDER, type TrendPoint, type TrendRange } from '../data/trends';
import { MONTH_NAMES } from './calendar';
import { useTheme } from './theme';

const H = 150;
const PAD = { left: 26, right: 8, top: 10, bottom: 22 };

/** Width-aware SVG area: measures itself, then draws. */
function ChartArea({ children, height = H }: { children: (w: number) => React.ReactNode; height?: number }) {
  const [w, setW] = useState(0);
  return (
    <View style={{ height }} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Svg width={w} height={height}>
          {children(w)}
        </Svg>
      )}
    </View>
  );
}

function dateLabel(ts: number, range: TrendRange): string {
  const d = new Date(ts);
  return range === '1y' ? MONTH_NAMES[d.getMonth()]!.slice(0, 3) : `${d.getDate()} ${MONTH_NAMES[d.getMonth()]!.slice(0, 3)}`;
}

/** First, middle and last dates under a chart. */
function XLabels({ points, range, w, x }: { points: TrendPoint[]; range: TrendRange; w: number; x: (i: number) => number }) {
  const t = useTheme();
  const idx = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  return (
    <>
      {idx.map((i, k) => (
        <SvgText
          key={k}
          x={Math.min(Math.max(x(i), PAD.left + 14), w - PAD.right - 14)}
          y={H - 6}
          fontSize={10}
          fill={t.muted}
          textAnchor="middle"
        >
          {dateLabel(points[i]!.ts, range)}
        </SvgText>
      ))}
    </>
  );
}

/** Social Health out of 10 over time; each point in its band's colour. */
export function ScoreTrend({ points, range }: { points: TrendPoint[]; range: TrendRange }) {
  const t = useTheme();
  return (
    <ChartArea>
      {(w) => {
        const x = (i: number) => PAD.left + ((w - PAD.left - PAD.right) * i) / Math.max(1, points.length - 1);
        const y = (s: number) => PAD.top + ((H - PAD.top - PAD.bottom) * (10 - s)) / 9;
        const scored = points.map((p, i) => (p.total === null ? null : { i, s: scoreOutOf10(p.total) }));
        const line = scored.filter((p): p is { i: number; s: number } => p !== null);
        return (
          <>
            {[1, 5, 10].map((s) => (
              <Line key={s} x1={PAD.left} x2={w - PAD.right} y1={y(s)} y2={y(s)} stroke={t.border} strokeWidth={1} />
            ))}
            {[1, 5, 10].map((s) => (
              <SvgText key={`l${s}`} x={PAD.left - 6} y={y(s) + 4} fontSize={10} fill={t.muted} textAnchor="end">
                {s}
              </SvgText>
            ))}
            {line.length > 1 && (
              <Polyline
                points={line.map((p) => `${x(p.i)},${y(p.s)}`).join(' ')}
                fill="none"
                stroke={t.accent}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
            )}
            {line.map((p) => (
              <Circle key={p.i} cx={x(p.i)} cy={y(p.s)} r={points.length > 20 ? 2.5 : 4} fill={t.health[scoreBand(p.s)]} />
            ))}
            <XLabels points={points} range={range} w={w} x={x} />
          </>
        );
      }}
    </ChartArea>
  );
}

/** How many relationships were in each closeness band at each point (stacked, closest at the bottom). */
export function ClosenessTrend({ points, range }: { points: TrendPoint[]; range: TrendRange }) {
  const t = useTheme();
  const max = Math.max(1, ...points.map((p) => BAND_ORDER.reduce((s, b) => s + p.bands[b], 0)));
  return (
    <View>
      <ChartArea>
        {(w) => {
          const slot = (w - PAD.left - PAD.right) / points.length;
          const bar = Math.max(2, slot * 0.7);
          const x = (i: number) => PAD.left + slot * i + slot / 2;
          const h = (n: number) => ((H - PAD.top - PAD.bottom) * n) / max;
          return (
            <>
              <Line x1={PAD.left} x2={w - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke={t.border} />
              <SvgText x={PAD.left - 6} y={PAD.top + 8} fontSize={10} fill={t.muted} textAnchor="end">
                {max}
              </SvgText>
              {points.map((p, i) => {
                let base = H - PAD.bottom;
                return BAND_ORDER.map((b) => {
                  const n = p.bands[b];
                  if (!n) return null;
                  base -= h(n);
                  return <Rect key={`${i}-${b}`} x={x(i) - bar / 2} y={base} width={bar} height={h(n)} fill={t.health[b]} />;
                });
              })}
              <XLabels points={points} range={range} w={w} x={x} />
            </>
          );
        }}
      </ChartArea>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
        {BAND_ORDER.map((b) => (
          <View key={String(b)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: t.health[b] }} />
            <Text style={{ color: t.muted, fontSize: 11 }}>{HEALTH_LABELS[b]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Catch-ups per period, with answered calls beside them when call history is connected. */
export function CatchUpTrend({ points, range, showCalls }: { points: TrendPoint[]; range: TrendRange; showCalls: boolean }) {
  const t = useTheme();
  const max = Math.max(1, ...points.map((p) => Math.max(p.catchUps, showCalls ? p.calls : 0)));
  return (
    <View>
      <ChartArea>
        {(w) => {
          const slot = (w - PAD.left - PAD.right) / points.length;
          const bar = Math.max(2, (slot * 0.7) / (showCalls ? 2 : 1));
          const x = (i: number) => PAD.left + slot * i + slot / 2;
          const h = (n: number) => ((H - PAD.top - PAD.bottom) * n) / max;
          return (
            <>
              <Line x1={PAD.left} x2={w - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke={t.border} />
              <SvgText x={PAD.left - 6} y={PAD.top + 8} fontSize={10} fill={t.muted} textAnchor="end">
                {max}
              </SvgText>
              {points.map((p, i) => (
                <Rect
                  key={`c${i}`}
                  x={showCalls ? x(i) - bar : x(i) - bar / 2}
                  y={H - PAD.bottom - h(p.catchUps)}
                  width={bar}
                  height={h(p.catchUps)}
                  fill={t.accent}
                  rx={1}
                />
              ))}
              {showCalls &&
                points.map((p, i) => (
                  <Rect key={`k${i}`} x={x(i)} y={H - PAD.bottom - h(p.calls)} width={bar} height={h(p.calls)} fill={t.health[4]} rx={1} />
                ))}
              <XLabels points={points} range={range} w={w} x={x} />
            </>
          );
        }}
      </ChartArea>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
        <Legend colour={t.accent} label="Catch-ups logged" />
        {showCalls && <Legend colour={t.health[4]} label="Calls" />}
      </View>
    </View>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: colour }} />
      <Text style={{ color: t.muted, fontSize: 11 }}>{label}</Text>
    </View>
  );
}
