import {px} from './scale';

export const colors = {
  background: '#0a1628',
  surface: '#11223d',
  surfaceRaised: '#1a2f52',
  menu: '#081120',
  violet: '#7d5cf5',
  violetLight: '#c58bff',
  cyan: '#3fc6ee',
  text: '#f1f5fb',
  textMuted: '#9fb0c8',
  focus: '#3fc6ee',
  transparent: 'transparent',
} as const;

/** Spacing scale in dp, from 1080p design values. */
export const spacing = {
  xxs: px(4),
  xs: px(8),
  sm: px(16),
  md: px(24),
  lg: px(32),
  xl: px(48),
  xxl: px(64),
} as const;

export const radius = {
  sm: px(8),
  md: px(12),
  lg: px(20),
  pill: px(999),
} as const;

export const typography = {
  display: {fontSize: px(64), lineHeight: px(76), fontWeight: '700'},
  title: {fontSize: px(44), lineHeight: px(54), fontWeight: '700'},
  heading: {fontSize: px(34), lineHeight: px(42), fontWeight: '600'},
  body: {fontSize: px(28), lineHeight: px(36), fontWeight: '400'},
  label: {fontSize: px(26), lineHeight: px(32), fontWeight: '600'},
  caption: {fontSize: px(22), lineHeight: px(28), fontWeight: '400'},
} as const;

/** Focus ring shared by every focusable component. */
export const focus = {
  borderWidth: px(6),
  scale: 1.06,
} as const;

/** Card and layout sizes in dp. */
export const layout = {
  menuWidth: px(320),
  screenPadding: px(64),
  posterCard: {width: px(208), height: px(312)},
  landscapeCard: {width: px(400), height: px(225)},
  cardTextHeight: px(76),
  cardGap: px(32),
  progressHeight: px(8),
} as const;
