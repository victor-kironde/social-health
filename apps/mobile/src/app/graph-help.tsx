import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { groupHealthColour } from '../data/health';
import { AddPersonIcon, CatchUpIcon, FocusIcon, HelpIcon, PeopleIcon } from '../graph/icons';
import { useTheme } from '../ui/theme';

/** Plain-language key to everything the network graph draws, each with a small sample drawing. */
export default function GraphHelp() {
  const t = useTheme();
  const c = t.category;
  const h = t.health;

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
            <Circle cx={36} cy={28} r={15} fill={t.card} stroke={h[5]} strokeWidth={4} />
            <SvgText x={36} y={33} fontSize={13} fontWeight="700" fill={t.text} textAnchor="middle">
              A
            </SvgText>
          </Art>
        }
      >
        Each circle is someone you added, showing their photo if you chose one, or their initial.
      </Item>
      <Item
        title="Colour: how the relationship is doing"
        art={
          <Art>
            {([1, 2, 3, 4, 5] as const).map((b, k) => (
              <Circle key={b} cx={8 + k * 14} cy={28} r={6} fill={t.card} stroke={h[b]} strokeWidth={3} />
            ))}
          </Art>
        }
      >
        The ring and the line to you run from <Swatch colour={h[5]}>green (close)</Swatch> and{' '}
        <Swatch colour={h[4]}>connected</Swatch>, through <Swatch colour={h[3]}>amber (drifting a little)</Swatch>{' '}
        and <Swatch colour={h[2]}>distant</Swatch>, to <Swatch colour={h[1]}>red (strained)</Swatch>. A
        relationship is only as close as its weaker side: how you said it is going, and whether you are keeping to the
        rhythm you hoped for. A relationship you rated harmful is red however often you meet; a good one you have
        drifted from turns amber. In Display & filters you can colour people by type or group instead.
      </Item>
      <Item
        title="Size: how much you are in touch"
        art={
          <Art>
            {[3, 4.5, 6.5, 9, 12].map((r, k) => (
              <Circle key={k} cx={[5, 14, 26, 42, 60][k]} cy={30} r={r} fill={t.card} stroke={h[5]} strokeWidth={2} />
            ))}
          </Art>
        }
      >
        There are five sizes. The smallest is someone you have not been in touch with yet; the rest rank everyone
        else from least to most in touch. Every catch-up you log and every call counts, and older ones count for less
        (they halve every 30 days), so recent, frequent catch-ups make someone bigger.
      </Item>
      <Item
        title="Grey, faint and further out: lost touch"
        art={
          <Art>
            <G opacity={0.38}>
              <Circle cx={44} cy={28} r={13} fill={t.card} stroke={h.lost} strokeWidth={4} />
            </G>
            <Circle cx={12} cy={28} r={5} fill={t.accent} />
          </Art>
        }
      >
        Someone you have not been in touch with for three times their usual rhythm (or ever), or whose relationship
        you paused, turns grey, fades and drifts further from you. Someone only a little behind fades slightly. These
        are gentle reminders, not judgements: you decide who matters.
      </Item>
      <Item
        title="Glow: in touch this week"
        art={
          <Art>
            <Circle cx={36} cy={28} r={24} fill={h[5]} opacity={0.18} />
            <Circle cx={36} cy={28} r={19} fill={h[5]} opacity={0.22} />
            <Circle cx={36} cy={28} r={14} fill={t.card} stroke={h[5]} strokeWidth={4} />
          </Art>
        }
      >
        A softly pulsing glow means you have been in touch within the last 7 days.
      </Item>
      <Item
        title="Outer ring: connects groups"
        art={
          <Art>
            <Circle cx={36} cy={28} r={14} fill={t.card} stroke={h[4]} strokeWidth={4} />
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
        The closer someone is to you, the more important you said they are (importance 1–10, in five rings: 1–2
        outermost, 9–10 innermost). In Display & filters you can order the
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
            <Circle cx={28} cy={28} r={18} fill={groupHealthColour([5, 5, 4], h)} opacity={0.3} />
            <Circle cx={46} cy={28} r={18} fill={groupHealthColour([3, 'lost'], h)} opacity={0.3} />
            <Circle cx={37} cy={28} r={5} fill={t.card} stroke={h[4]} strokeWidth={2} />
          </Art>
        }
      >
        Softly shaded areas group the people of each relationship type, named on the graph. An area always
        wraps whole people, so it never looks like a line. Each area takes the
        overall health of the relationships in it: a muted green for a group that is going well, warmer when some are
        strained, and greyer the more of them you have lost touch with. So you can see at a glance, say, that family
        is doing well while work contacts are drifting. Someone can belong to more than one type (set "Also part of"
        on their page), and then they sit where the areas overlap, like a relative you also work with. When you
        colour people by type, each area uses its type colour instead:{' '}
        <Swatch colour={c.family}>family</Swatch>, <Swatch colour={c.friend}>friends</Swatch>,{' '}
        <Swatch colour={c.work}>work</Swatch>, <Swatch colour={c.neighbour}>neighbours</Swatch>,{' '}
        <Swatch colour={c.community}>community</Swatch> and <Swatch colour={c.other}>other</Swatch>.
      </Item>
      <Item
        title="Groups"
        art={
          <Art>
            <Circle cx={26} cy={30} r={16} fill={t.groups[0]} opacity={0.25} />
            <Circle cx={50} cy={26} r={16} fill={t.groups[2]} opacity={0.25} />
            <Circle cx={38} cy={28} r={5} fill={t.card} stroke={h[5]} strokeWidth={2} />
          </Art>
        }
      >
        A group, like a team, a book club or your patients, is a relationship of its own. It appears as a rounded
        square, with thin lines to its members, and has its own importance, rhythm and ideal. Log a catch-up "with a
        group": tick anyone you know who was there (they join the group) and add how many new people there were (only
        the number is kept). Tap a group to collapse its members into it, or expand them again. In Display & filters
        you can also show groups as the shaded areas, or show only their people.
      </Item>

      <Heading>Lines</Heading>
      <Item
        title="Lines to you"
        art={
          <Art>
            <Polyline points="10,44 10,14 60,14" fill="none" stroke={h[5]} strokeWidth={5} />
            <Polyline points="10,44 60,44" fill="none" stroke={h[2]} strokeWidth={2} />
          </Art>
        }
      >
        Every person has a line to you. Thicker lines are more important relationships, and the line takes the same
        health colour as the person. Lines to people you have lost touch with are faint. Lines turn at right angles
        to keep the drawing tidy.
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
        A thin grey line joins two people you have caught up with together, such as a dinner with both. Thicker
        means more often or more recently. From these links the app finds groups of people who know each other, and
        who connects those groups.
      </Item>

      <Heading>Score and details</Heading>
      <Item
        title="Social Health score"
        art={
          <Art>
            <Circle cx={36} cy={28} r={20} fill="none" stroke={t.track} strokeWidth={5} />
            <Circle
              cx={36}
              cy={28}
              r={20}
              fill="none"
              stroke={h[3]}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 20 * 0.6} ${2 * Math.PI * 20}`}
              transform="rotate(-90 36 28)"
            />
            <SvgText x={36} y={33} fontSize={14} fontWeight="800" fill={t.text} textAnchor="middle">
              6
            </SvgText>
          </Art>
        }
      >
        Shown in the top-left corner as a number from 1 to 10. The ring fills up to the score and turns from red
        (low) to green (high). It sums up keeping in touch: your rhythms, variety across types, calls, how
        relationships are going and recent catch-ups, with more important people counting more. With filters on (say,
        only family, or only importance 7+ to see how your closest relationships are doing), it scores just the people
        shown and says "filtered". Tap it for details. You can hide the score in Settings at any
        time.
      </Item>
      <Item
        title="How often you hope to catch up"
        art={
          <Art>
            <Rect x={10} y={14} width={52} height={30} rx={6} fill="none" stroke={t.border} strokeWidth={2} />
            {[0, 1, 2, 3].map((k) => (
              <Circle key={k} cx={20 + k * 11} cy={29} r={3} fill={k < 2 ? h[5] : t.border} />
            ))}
          </Art>
        }
      >
        Everyone starts with your default rhythm, at least once a month unless you change it in Settings. On anyone's
        page you can choose their own: a preset like weekly, or Custom, such as "at least twice a month" or "at least 5
        times a week". Catching up more often than that never counts against you. For someone you live or work with,
        switch on "Lives or works with you": you see each other anyway, so time between logged catch-ups counts only a
        tenth as much.
      </Item>
      <Item
        title="Your ideal for each relationship"
        art={
          <Art>
            <Line x1={8} y1={28} x2={64} y2={28} stroke={t.border} strokeWidth={3} strokeLinecap="round" />
            <Circle cx={22} cy={28} r={6} fill={h[2]} />
            <Circle cx={22} cy={28} r={11} fill="none" stroke={t.text} strokeWidth={1.5} strokeDasharray="3 3" />
          </Art>
        }
      >
        On each person's page you can say how close you would like the relationship to be, from 1 to 10. Until you set it,
        it counts as 10 (as close as possible), and the details card shows it as not set with a link to set it. Lower it for a relationship you want to keep at a distance, such as co-parenting with
        an ex: the score then counts it as doing well when it stays near that, and contact far beyond it counts against
        it. Choose "Don't mind" to leave someone out of the score altogether. Their colour on the graph still shows how
        close you actually are; the details card says how that compares with your ideal.
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
        Tap a person to see their details over the graph, starting with the relationship's own score out of 10
        and how close you are, such as "6 · Drifting a little". It comes from keeping to rhythm, calls, how you rated it and
        recent catch-ups, and always sits in its colour's range: 9–10 close, 7–8 connected, 5–6 drifting a little,
        3–4 distant, 1–2 strained or lost touch. Below it: importance, last catch-up, rhythm, how often you are in
        touch compared with others, recent catch-ups and calls, and their place in your network. Double-tap the card
        or tap their photo to open their page.
      </Item>

      <Heading>Using the graph</Heading>
      <Gesture icon="Tap" text="A person: show their details. Their photo in the details: open their page. Anywhere else: close details." />
      <Gesture icon="Double-tap" text="A person or their details: open their page. Empty space: fit everyone in view." />
      <Gesture icon="Drag" text="A person (in rings): move them; they settle back gently. Empty space: move around." />
      <Gesture icon="Pinch" text="Zoom in or out. Names appear when you zoom in on a busy graph." />
      <Gesture icon={<FocusIcon colour={t.text} />} text="Fit the whole graph back in view (bottom right)." />
      <Gesture icon={<HelpIcon colour={t.text} />} text="This page." />
      <Gesture icon={<CatchUpIcon colour={t.text} />} text="Log a catch-up (bottom left)." />
      <Gesture icon={<AddPersonIcon colour={t.text} />} text="Add someone, yourself or from your contacts." />
      <Gesture icon={<PeopleIcon colour={t.text} />} text="Everyone as a list, with your Social Health score and recent changes." />
      <Gesture
        icon="Display & filters"
        text="Choose rings or tiers, what to order by, what to show (areas, sizes, lines, names), whether areas show types or your groups, what colours people (health, type or group), and who to show (types, your groups, importance, behind rhythm, not yet caught up)."
      />

      <Text style={[styles.note, { color: t.muted }]}>
        The graph is a tool for reflection, not a measure of your worth. Relationships change, and gaps between catch-ups
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
