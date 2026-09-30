import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

/** Small outlined icons for the graph's round buttons, all on a 24-unit grid with a 2-unit stroke. */
const STROKE = { fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function FocusIcon({ colour }: { colour: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M3 8V4.5A1.5 1.5 0 0 1 4.5 3H8M16 3h3.5A1.5 1.5 0 0 1 21 4.5V8M21 16v3.5a1.5 1.5 0 0 1-1.5 1.5H16M8 21H4.5A1.5 1.5 0 0 1 3 19.5V16"
        stroke={colour}
        {...STROKE}
      />
      <Circle cx={12} cy={12} r={3} fill={colour} />
    </Svg>
  );
}

export function HelpIcon({ colour }: { colour: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={colour} {...STROKE} />
      <SvgText x={12} y={16.5} fontSize={13} fontWeight="700" fill={colour} textAnchor="middle">
        ?
      </SvgText>
    </Svg>
  );
}

/** Everyone as a list (People & score). */
export function PeopleIcon({ colour }: { colour: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Circle cx={9} cy={8} r={3.2} stroke={colour} {...STROKE} />
      <Path d="M3 19.5c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6" stroke={colour} {...STROKE} />
      <Circle cx={16.8} cy={8.8} r={2.5} stroke={colour} {...STROKE} />
      <Path d="M16.2 13.9c2.8.3 4.8 2.3 4.8 5.1" stroke={colour} {...STROKE} />
    </Svg>
  );
}

/** Log a catch-up: a speech bubble with a plus. */
export function CatchUpIcon({ colour }: { colour: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M4.5 4h15A1.5 1.5 0 0 1 21 5.5v10a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17h-1A1.5 1.5 0 0 1 3 15.5v-10A1.5 1.5 0 0 1 4.5 4z"
        stroke={colour}
        {...STROKE}
      />
      <Path d="M12 7.5v6M9 10.5h6" stroke={colour} {...STROKE} />
    </Svg>
  );
}

/** Add a person: a person with a plus. */
export function AddPersonIcon({ colour }: { colour: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Circle cx={9.5} cy={8} r={3.4} stroke={colour} {...STROKE} />
      <Path d="M3 20c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6" stroke={colour} {...STROKE} />
      <Path d="M19 7v6M16 10h6" stroke={colour} {...STROKE} />
    </Svg>
  );
}

/** Regular meetups: a calendar with a tick. */
export function MeetupsIcon({ colour }: { colour: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M4.5 5h15A1.5 1.5 0 0 1 21 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-13A1.5 1.5 0 0 1 4.5 5z" stroke={colour} {...STROKE} />
      <Path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4" stroke={colour} {...STROKE} />
    </Svg>
  );
}

/** Put moved people back: a circular arrow. */
export function ResetIcon({ colour }: { colour: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M4 12a8 8 0 1 0 2.4-5.7" stroke={colour} {...STROKE} />
      <Path d="M4 4v4.5h4.5" stroke={colour} {...STROKE} />
    </Svg>
  );
}
