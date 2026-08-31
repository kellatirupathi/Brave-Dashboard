/**
 * BRAVE design tokens, native edition.
 *
 * These are the SAME brand values the web app defines as HSL custom properties
 * in `artifacts/brave-dashboard/src/index.css`, converted to hex because React
 * Native has no CSS variables and no `hsl()` in StyleSheet.
 *
 * The palette is deliberately identical — a student moving between the website
 * and the app should see one product. What changes in this app is the LAYOUT
 * and the INTERACTIONS, not the colours.
 */

export const colors = {
  /** Page background — warm cream, not white. */
  background: '#FDFBF6',
  /** Body text: near-black with a red cast, never pure #000. */
  foreground: '#2F0E0E',

  card: '#FFFFFF',
  cardBorder: '#EBE4D6',

  /** Brand red. Primary actions. */
  primary: '#C91D1D',
  primaryForeground: '#FDFBF6',

  /** The brighter red used for high-emphasis buttons ("Log a client"). */
  accentRed: '#E61A1A',

  muted: '#F7F4ED',
  mutedForeground: '#6F5C52',

  accent: '#FCEEC5',
  accentForeground: '#3A1414',

  border: '#EBE4D6',

  /** Dark maroon chrome — the app bar and the tab bar. */
  chrome: '#5C1414',
  chromeForeground: '#FDF9ED',
  chromeBorder: '#732626',
  /** Gold — the active tab, and the dot in the BRAVE wordmark. */
  gold: '#F9C31F',
  goldForeground: '#3A1414',
  /** Pill behind the active tab icon. */
  chromeActive: '#7E2525',

  success: '#1B873F',
  successBg: '#E8F5EC',
  warning: '#B4690E',
  warningBg: '#FDF3E2',
  danger: '#C91D1D',
  dangerBg: '#FCEAEA',

  white: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.45)',
} as const;

/**
 * A 4pt spacing scale. Native layouts need tighter, more consistent rhythm
 * than the web app's Tailwind classes produced ad hoc.
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * Type scale. `Roboto` is Android's system face — using it (rather than
 * shipping a webfont) is a large part of why a native app reads as native.
 */
export const font = {
  family: 'Roboto',
  display: { fontSize: 30, lineHeight: 36, fontWeight: '800' as const },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '700' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  micro: { fontSize: 11, lineHeight: 15, fontWeight: '600' as const },
} as const;

/**
 * Material elevation. Android draws shadows from `elevation`; iOS needs the
 * shadow* family. Both are set so the same component looks right on either.
 */
export const elevation = (level: 1 | 2 | 3) => ({
  elevation: level * 2,
  shadowColor: '#3A1414',
  shadowOpacity: 0.06 + level * 0.02,
  shadowRadius: level * 3,
  shadowOffset: { width: 0, height: level },
});
