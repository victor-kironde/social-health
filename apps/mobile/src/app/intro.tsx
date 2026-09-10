import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { markIntroSeen } from '../data/onboarding';
import { useStore } from '../data/store';
import { CalmBackground } from '../ui/CalmBackground';
import { useReduceMotion } from '../ui/useReduceMotion';

/** The intro always sits on the dark animated background, so it uses its own light-on-dark colours. */
const C = {
  text: '#f2f4f7',
  muted: 'rgba(242, 244, 247, 0.72)',
  you: '#6e9cf0',
  card: 'rgba(16, 20, 28, 0.55)',
  line: 'rgba(242, 244, 247, 0.35)',
  health: { 1: '#f26d6d', 2: '#f5a05c', 3: '#f0c94f', 4: '#a3d65c', 5: '#4cc779', lost: '#8a919c' },
  button: 'rgba(242, 244, 247, 0.14)',
  buttonBorder: 'rgba(242, 244, 247, 0.35)',
};

/** A small sample network for the first slide: x, y, radius, health. */
const NETWORK = [
  [60, 40, 10, 5],
  [150, 34, 13, 5],
  [178, 104, 9, 4],
  [40, 112, 12, 5],
  [118, 140, 8, 3],
] as const;

interface Slide {
  title: string;
  body: string;
  art: ReactNode;
}

const SLIDES: Slide[] = [
  {
    title: 'Your people, around you',
    body: 'Social Graph draws a calm, living map of the people who matter to you, with you at the centre. The closer someone is, the more important they are to you.',
    art: (
      <Art>
        {NETWORK.map(([x, y], i) => (
          <Line key={`l${i}`} x1={110} y1={86} x2={x} y2={y} stroke={C.line} strokeWidth={1.5} />
        ))}
        {NETWORK.map(([x, y, r, h], i) => (
          <Circle key={i} cx={x} cy={y} r={r} fill="#1b1e23" stroke={C.health[h]} strokeWidth={3} />
        ))}
        <Circle cx={110} cy={86} r={16} fill={C.you} />
        <SvgText x={110} y={90} fontSize={10} fontWeight="700" fill="#0b1220" textAnchor="middle">
          You
        </SvgText>
      </Art>
    ),
  },
  {
    title: 'See how each relationship is doing',
    body: 'Green means a relationship is going well, amber that it needs a little attention, red that it is strained. People you have lost touch with turn grey and drift outward. Bigger circles are people you are in touch with more.',
    art: (
      <Art>
        {([5, 4, 3, 2, 1] as const).map((h, i) => (
          <Circle key={h} cx={30 + i * 40} cy={70} r={16 - i * 1.5} fill="#1b1e23" stroke={C.health[h]} strokeWidth={4} />
        ))}
        <Circle cx={110} cy={135} r={9} fill="#1b1e23" stroke={C.health.lost} strokeWidth={3} opacity={0.45} />
      </Art>
    ),
  },
  {
    title: 'Keep in touch, gently',
    body: 'Log a catch-up (a call, a coffee, a message) in a few taps, or connect your call history. Choose how often you hope to be in touch with each person, and the app quietly notices when someone is drifting.',
    art: (
      <Art>
        <Rect x={50} y={30} width={120} height={110} rx={14} fill={C.card} stroke={C.line} />
        {[0, 1, 2].map((k) => (
          <Rect key={k} x={64} y={48 + k * 30} width={92} height={20} rx={10} fill={k === 0 ? C.health[5] : C.button} />
        ))}
        <Polyline points="70,58 76,64 86,52" fill="none" stroke="#0b1220" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </Art>
    ),
  },
  {
    title: 'Your Social Health, out of 10',
    body: 'One number from 1 to 10 sums up how you are keeping in touch, with a breakdown you can explore. It is a reflection, not a judgement: there are no streaks or leaderboards, and you can hide it at any time.',
    art: (
      <Art>
        <Circle cx={110} cy={86} r={48} fill="none" stroke="rgba(242,244,247,0.15)" strokeWidth={10} />
        <Circle
          cx={110}
          cy={86}
          r={48}
          fill="none"
          stroke={C.health[4]}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 48 * 0.7} ${2 * Math.PI * 48}`}
          transform="rotate(-90 110 86)"
        />
        <SvgText x={110} y={100} fontSize={40} fontWeight="800" fill={C.text} textAnchor="middle">
          7
        </SvgText>
      </Art>
    ),
  },
  {
    title: 'Private by design',
    body: 'Everything stays on this phone, in an encrypted database. There is no account and no server. When you import contacts, only the names you choose are copied, never numbers.',
    art: (
      <Art>
        <Rect x={78} y={70} width={64} height={54} rx={10} fill={C.card} stroke={C.text} strokeWidth={3} />
        <Path d="M92 70 V56 a18 18 0 0 1 36 0 V70" fill="none" stroke={C.text} strokeWidth={3} />
        <Circle cx={110} cy={94} r={6} fill={C.text} />
        <Line x1={110} y1={98} x2={110} y2={110} stroke={C.text} strokeWidth={3} strokeLinecap="round" />
      </Art>
    ),
  },
];

/** One-time introduction, shown the first time the app opens (and from Settings on request). */
export default function Intro() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReduceMotion();
  const { log } = useStore();
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const last = page === SLIDES.length - 1;
  const hasPeople = log.people.length > 0;

  const finish = async (next: () => void) => {
    await markIntroSeen().catch(() => undefined);
    next();
  };
  const goTo = (p: number) => {
    scroller.current?.scrollTo({ x: p * width, animated: !reducedMotion });
    setPage(p);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page) setPage(p);
  };

  return (
    <View style={styles.root}>
      <CalmBackground animate={!reducedMotion} />
      <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
        {!last && (
          <Pressable onPress={() => finish(() => router.back())} hitSlop={12} accessibilityRole="button">
            <Text style={{ color: C.muted, fontSize: 15 }}>Skip</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s) => (
          <View key={s.title} style={[styles.slide, { width }]}>
            <View style={styles.art}>{s.art}</View>
            <Text style={styles.title} accessibilityRole="header">
              {s.title}
            </Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${SLIDES.length}`}>
          {SLIDES.map((s, i) => (
            <View key={s.title} style={[styles.dot, i === page && styles.dotOn]} />
          ))}
        </View>
        {!last ? (
          <IntroButton title="Next" primary onPress={() => goTo(page + 1)} />
        ) : hasPeople ? (
          <IntroButton title="Start" primary onPress={() => finish(() => router.back())} />
        ) : (
          <View style={{ gap: 10, alignSelf: 'stretch' }}>
            <IntroButton
              title="Choose from my contacts"
              primary
              onPress={() => finish(() => router.replace({ pathname: '/import', params: { from: 'welcome' } }))}
            />
            <IntroButton title="Add someone myself" onPress={() => finish(() => router.replace('/person/new'))} />
            <IntroButton title="Explore first" onPress={() => finish(() => router.back())} />
          </View>
        )}
      </View>
    </View>
  );
}

function Art({ children }: { children: ReactNode }) {
  return (
    <Svg width={220} height={170} viewBox="0 0 220 170">
      {children}
    </Svg>
  );
}

function IntroButton({ title, onPress, primary = false }: { title: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: C.text } : { backgroundColor: C.button, borderColor: C.buttonBorder, borderWidth: 1 },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={{ color: primary ? '#0b1220' : C.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1220' },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 24, minHeight: 44 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 18 },
  art: { marginBottom: 12 },
  title: { color: C.text, fontSize: 26, fontWeight: '700', textAlign: 'center' },
  body: { color: C.muted, fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 460 },
  bottom: { paddingHorizontal: 24, alignItems: 'center', gap: 18 },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(242,244,247,0.3)' },
  dotOn: { backgroundColor: C.text, width: 22 },
  button: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 14, borderRadius: 14, maxWidth: 460, width: '100%' },
});
