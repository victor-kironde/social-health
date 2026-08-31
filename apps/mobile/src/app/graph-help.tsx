import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { QUALITY_LABELS } from '../ui/labels';
import { useTheme } from '../ui/theme';

/** Plain-language key to everything the network graph draws, each with a small sample drawing. */
export default function GraphHelp() {
  const t = useTheme();
  const c = t.category;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.intro, { color: t.muted }]}>
        Your graph is a map of the people you have added, drawn around you. Everything on it comes from what you
        record in the app, and it never leaves your phone.
      </Text>

      <Heading>People</Heading>
      <Item
        title="You"
        art={
          <Art>
            <Circle cx={36} cy={28} r={16} fill={t.accent} />
            <SvgText x={36} y={32} fontSize={10} fontWeight="700" fill={t.onAccent} textAnchor="middle">
              You
            </SvgText>
          </Art>
        }
      >
        You are always in the middle (or at the top, in tiers). Everyone else is placed relative to you.
      </Item>
      <Item
        title="A person"
        art={
          <Art>
            <Circle cx={36} cy={28} r={15} fill={t.card} stroke={c.family} strokeWidth={4} />
            <SvgText x={36} y={33} fontSize={13} fontWeight="700" fill={t.text} textAnchor="middle">
              A
            </SvgText>
          </Art>
        }
      >
        Each circle is someone you added, showing their photo if you chose one, or their initial. The ring colour is
        their main relationship type: <Swatch colour={c.family}>family</Swatch>, <Swatch colour={c.friend}>friend</Swatch>
        , <Swatch colour={c.work}>work</Swatch>, <Swatch colour={c.neighbour}>neighbour</Swatch> or{' '}
        <Swatch colour={c.community}>community</Swatch>. With "Colour rings by group" on, the ring shows which group
        they belong to instead.
      </Item>
      <Item
        title="Size: how much you are in touch"
        art={
          <Art>
            <Circle cx={18} cy={30} r={8} fill={t.card} stroke={c.friend} strokeWidth={3} />
            <Circle cx={48} cy={28} r={17} fill={t.card} stroke={c.friend} strokeWidth={4} />
          </Art>
        }
      >
        Bigger circles are people you have been in touch with more, and more recently. Every logged contact and call
        counts, and older ones count for less (they halve every 30 days). Sizes compare people with each other, so the
        person you are most in touch with is always the biggest.
      </Item>
      <Item
        title="Faded: behind your usual rhythm"
        art={
          <Art>
            <G opacity={0.4}>
              <Circle cx={36} cy={28} r={15} fill={t.card} stroke={c.work} strokeWidth={4} />
            </G>
          </Art>
        }
      >
        A faded person is someone you have not been in touch with as often as you hoped (the rhythm you set for
        them, such as monthly). It is a gentle reminder, not a judgement.
      </Item>
      <Item
        title="Glow: in touch this week"
        art={
          <Art>
            <Circle cx={36} cy={28} r={24} fill={c.friend} opacity={0.18} />
            <Circle cx={36} cy={28} r={19} fill={c.friend} opacity={0.22} />
            <Circle cx={36} cy={28} r={14} fill={t.card} stroke={c.friend} strokeWidth={4} />
          </Art>
        }
      >
        A softly pulsing glow means you have been in touch within the last 7 days.
      </Item>
      <Item
        title="Outer ring: connects groups"
        art={
          <Art>
            <Circle cx={36} cy={28} r={14} fill={t.card} stroke={c.neighbour} strokeWidth={4} />
            <Circle cx={36} cy={28} r={20} fill="none" stroke={t.text} strokeWidth={1.5} opacity={0.7} />
          </Art>
        }
      >
        A thin extra ring marks someone who links otherwise separate groups of your people, for example the friend
        who also knows your colleagues. These people often hold a network together.
      </Item>

      <Heading>Where people sit</Heading>
      <Item
        title="Rings around you"
        art={
          <Art>
            <Circle cx={36} cy={28} r={8} fill="none" stroke={t.border} />
            <Circle cx={36} cy={28} r={16} fill="none" stroke={t.border} />
            <Circle cx={36} cy={28} r={24} fill="none" stroke={t.border} />
            <Circle cx={36} cy={28} r={4} fill={t.accent} />
            <Circle cx={44} cy={28} r={3} fill={c.family} />
            <Circle cx={36} cy={12} r={3} fill={c.friend} />
            <Circle cx={15} cy={40} r={3} fill={c.work} />
          </Art>
        }
      >
        The closer someone is to you, the more important you said they are. In Display & filters you can order the
        rings by contact frequency or last contact instead. People of the same type gather on the same side, so each
        type has its own direction around you.
      </Item>
      <Item
        title="Tiers"
        art={
          <Art>
            <Circle cx={36} cy={8} r={4} fill={t.accent} />
            {[0, 1, 2].map((row) =>
              [0, 1, 2, 3].map((k) => (
                <Circle key={`${row}-${k}`} cx={15 + k * 14} cy={22 + row * 13} r={4} fill={t.card} stroke={c.friend} strokeWidth={2} />
              )),
            )}
          </Art>
        }
      >
        Tiers show the same people as a list: you at the top, then one row per level, most important first. Each row
        is grouped by type and sorted by name.
      </Item>
      <Item
        title="Relationship type areas"
        art={
          <Art>
            <Circle cx={28} cy={28} r={18} fill={c.family} opacity={0.25} />
            <Circle cx={46} cy={28} r={18} fill={c.work} opacity={0.25} />
            <Circle cx={37} cy={28} r={5} fill={t.card} stroke={c.family} strokeWidth={2} />
          </Art>
        }
      >
        Shaded areas group the people of each relationship type. Someone can belong to more than one type (set
        "Also part of" on their page), and then they sit where the areas overlap, like a relative you also work with.
      </Item>

      <Heading>Lines</Heading>
      <Item
        title="Lines to you"
        art={
          <Art>
            <Polyline points="10,44 10,14 60,14" fill="none" stroke={t.quality[5]} strokeWidth={5} />
            <Polyline points="10,44 60,44" fill="none" stroke={t.quality[2]} strokeWidth={2} />
          </Art>
        }
      >
        Every person has a line to you. Thicker lines are more important relationships. When "Colour lines by
        quality" is on, the colour shows how you said the relationship is going, from{' '}
        <Swatch colour={t.quality[1]}>{QUALITY_LABELS[1].toLowerCase()}</Swatch> to{' '}
        <Swatch colour={t.quality[5]}>{QUALITY_LABELS[5].toLowerCase()}</Swatch>. Grey
        means not rated. Lines turn at right angles to keep the drawing tidy.
      </Item>
      <Item
        title="Links between people"
        art={
          <Art>
            <Circle cx={14} cy={28} r={6} fill={t.card} stroke={c.friend} strokeWidth={2} />
            <Circle cx={58} cy={28} r={6} fill={t.card} stroke={c.friend} strokeWidth={2} />
            <Line x1={20} y1={28} x2={52} y2={28} stroke={t.muted} strokeWidth={2} opacity={0.6} />
          </Art>
        }
      >
        A thin grey line joins two people you have logged contact with together, such as a dinner with both. Thicker
        means more often or more recently. From these links the app finds groups of people who know each other, and
        who connects those groups.
      </Item>

      <Heading>Score and details</Heading>
      <Item
        title="Social Health score"
        art={
          <Art>
            <Rect x={8} y={12} width={56} height={32} rx={8} fill={t.card} stroke={t.border} />
            <SvgText x={16} y={24} fontSize={7} fill={t.muted}>
              Social Health
            </SvgText>
            <SvgText x={16} y={39} fontSize={14} fontWeight="800" fill={t.text}>
              64
            </SvgText>
          </Art>
        }
      >
        Shown in the top-left corner: a 0–100 summary of keeping in touch, covering your rhythms, your most
        important people, variety across types, calls, how relationships are going and recent contact. You can hide
        the number in Settings at any time.
      </Item>
      <Item
        title="Person details"
        art={
          <Art>
            <Rect x={8} y={8} width={56} height={40} rx={8} fill={t.card} stroke={t.border} />
            {[0, 1, 2, 3].map((k) => (
              <Line key={k} x1={14} y1={18 + k * 8} x2={58} y2={18 + k * 8} stroke={t.border} strokeWidth={2} />
            ))}
          </Art>
        }
      >
        Tap a person to see their details over the graph: importance, last contact, rhythm, how often you are in
        touch compared with others, recent contacts and calls, and their place in your network.
      </Item>

      <Heading>Using the graph</Heading>
      <Gesture icon="Tap" text="A person: show their details. A line: show what links them. Empty space: close details." />
      <Gesture icon="Double-tap" text="A person: open their page. Empty space: fit everyone in view." />
      <Gesture icon="Drag" text="A person (in rings): move them; they settle back gently. Empty space: move around." />
      <Gesture icon="Pinch" text="Zoom in or out. Names appear when you zoom in on a busy graph." />
      <Gesture
        icon={
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path
              d="M3 8V4.5A1.5 1.5 0 0 1 4.5 3H8M16 3h3.5A1.5 1.5 0 0 1 21 4.5V8M21 16v3.5a1.5 1.5 0 0 1-1.5 1.5H16M8 21H4.5A1.5 1.5 0 0 1 3 19.5V16"
              fill="none"
              stroke={t.text}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <Circle cx={12} cy={12} r={3} fill={t.text} />
          </Svg>
        }
        text="Fit the whole graph back in view."
      />
      <Gesture
        icon="Display & filters"
        text="Choose rings or tiers, what to order by, what to show (type areas, sizes, lines, names, colours), and who to show (types, importance, behind rhythm, never contacted)."
      />

      <Text style={[styles.note, { color: t.muted }]}>
        The graph is a tool for reflection, not a measure of your worth. Relationships change, and gaps in contact
        are normal. You decide what matters.
      </Text>
    </ScrollView>
  );
}

function Heading({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.heading, { color: t.text }]}>{children}</Text>;
}

function Art({ children }: { children: ReactNode }) {
  return (
    <Svg width={72} height={56} viewBox="0 0 72 56">
      {children}
    </Svg>
  );
}

function Item({ title, art, children }: { title: string; art: ReactNode; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.item, { backgroundColor: t.card }]}>
      <View style={styles.art}>{art}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        <Text style={[styles.body, { color: t.muted }]}>{children}</Text>
      </View>
    </View>
  );
}

function Gesture({ icon, text }: { icon: ReactNode; text: string }) {
  const t = useTheme();
  return (
    <View style={styles.gesture}>
      <View style={[styles.gestureIcon, { borderColor: t.border }]}>
        {typeof icon === 'string' ? <Text style={{ color: t.text, fontWeight: '600', fontSize: 12 }}>{icon}</Text> : icon}
      </View>
      <Text style={[styles.body, { color: t.muted, flex: 1 }]}>{text}</Text>
    </View>
  );
}

function Swatch({ colour, children }: { colour: string; children: ReactNode }) {
  return <Text style={{ color: colour, fontWeight: '700' }}>{children}</Text>;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  intro: { fontSize: 14, lineHeight: 20 },
  heading: { fontSize: 17, fontWeight: '700', marginTop: 12 },
  item: { flexDirection: 'row', gap: 12, borderRadius: 12, padding: 12, alignItems: 'flex-start' },
  art: { width: 72, alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  body: { fontSize: 13, lineHeight: 19 },
  gesture: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  gestureIcon: {
    minWidth: 92,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  note: { fontSize: 13, lineHeight: 19, marginTop: 16, fontStyle: 'italic' },
});
