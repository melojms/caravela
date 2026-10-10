import {Path, Svg} from '@amazon-devices/react-native-svg';
import React from 'react';

import {DetailsActionIcon} from './types';

// Vector paths ported from androidtv's res/drawable (24x24 viewport unless
// noted).

const ACTION_PATHS: Record<DetailsActionIcon, string> = {
  // ic_resume
  resume: 'M12,18l8.5,-6L12,6v12zM6,6v12h2V6h-2z',
  // ic_play
  play: 'm8,5v14l11,-7z',
  // ic_watch: a tick
  watched: 'M9,16.2L4.8,12l-1.4,1.4L9,19 21,7l-1.4,-1.4L9,16.2z',
  // ic_heart
  favorite:
    'm12,19.34 l-1.16,-1.056c-4.12,-3.736 -6.84,-6.2 -6.84,-9.224 0,-2.464 1.936,-4.4 4.4,-4.4 1.392,0 2.728,0.648 3.6,1.672 0.872,-1.024 2.208,-1.672 3.6,-1.672 2.464,0 4.4,1.936 4.4,4.4 0,3.024 -2.72,5.488 -6.84,9.232z',
};

// ic_star, tinted like androidtv's community rating.
const STAR_PATH =
  'M12,17.27L18.18,21l-1.64,-7.03L22,9.24l-7.19,-0.61L12,2 9.19,8.63 2,9.24l5.46,4.73L5.82,21z';
export const STAR_COLOR = '#eece55';

// ic_rt_fresh, 138.75x141.25 viewport, three coloured parts.
const FRESH_PARTS = [
  {
    d: 'm20.154,40.829c-28.149,27.622 -13.657,61.011 -5.734,71.931 35.254,41.954 92.792,25.339 111.89,-5.907 4.761,-8.203 22.554,-53.467 -23.976,-78.009z',
    fill: '#f93208',
  },
  {
    d: 'm39.613,39.265 l4.778,-8.861 28.406,-5.038 11.119,9.208z',
    fill: '#f93208',
  },
  {
    d: 'm39.436,8.57 l8.968,-5.283 6.757,15.479c3.793,-6.323 13.79,-16.316 24.939,-4.668 -4.728,1.264 -7.516,3.855 -7.74,8.477 15.145,-4.17 31.343,3.213 33.539,9.091 -10.951,-4.314 -27.695,10.377 -41.771,2.334 0.009,15.045 -12.617,16.636 -19.902,17.076 2.077,-4.996 5.591,-9.994 1.474,-14.987 -7.618,8.171 -13.874,10.668 -33.17,4.668 4.876,-1.679 14.843,-11.39 24.448,-11.425 -6.775,-2.467 -12.29,-2.087 -17.814,-1.475 2.917,-3.961 12.149,-15.197 28.625,-8.476z',
    fill: '#02902e',
  },
];

// ic_rt_rotten, 145x140 viewport.
const ROTTEN_PATH =
  'M47.4,35.342c-13.607,-7.935 -12.32,-25.203 2.097,-31.88 26.124,-6.531 29.117,13.78 22.652,30.412 -6.542,24.11 18.095,23.662 19.925,10.067 3.605,-18.412 19.394,-26.695 31.67,-16.359 12.598,12.135 7.074,36.581 -17.827,34.187 -16.03,-1.545 -19.552,19.585 0.839,21.183 32.228,1.915 42.49,22.167 31.04,35.865 -15.993,15.15 -37.691,-4.439 -45.512,-19.505 -6.8,-9.307 -17.321,0.11 -13.423,6.502 12.983,19.465 2.923,31.229 -10.906,30.62 -13.37,-0.85 -20.96,-9.06 -13.214,-29.15 3.897,-12.481 -8.595,-15.386 -16.57,-5.45 -11.707,19.61 -28.865,13.68 -33.976,4.19 -3.243,-7.621 -2.921,-25.846 24.119,-23.696 16.688,4.137 11.776,-12.561 -0.63,-13.633 -9.245,-0.443 -30.501,-7.304 -22.86,-24.54 7.34,-11.056 24.958,-11.768 33.348,6.293 3.037,4.232 8.361,11.042 18.037,5.033 3.51,-5.197 1.21,-13.9 -8.809,-20.135z';
const ROTTEN_COLOR = '#0fc755';

type IconProps = {size: number; testID?: string};

export const ActionIcon = ({
  icon,
  color,
  size,
  testID,
}: IconProps & {icon: DetailsActionIcon; color: string}) => (
  <Svg testID={testID} width={size} height={size} viewBox="0 0 24 24">
    <Path d={ACTION_PATHS[icon]} fill={color} />
  </Svg>
);

export const StarIcon = ({size, testID}: IconProps) => (
  <Svg testID={testID} width={size} height={size} viewBox="0 0 24 24">
    <Path d={STAR_PATH} fill={STAR_COLOR} />
  </Svg>
);

/** Rotten Tomatoes' tomato when fresh, the green splat when rotten. */
export const TomatoIcon = ({
  fresh,
  size,
  testID,
}: IconProps & {fresh: boolean}) =>
  fresh ? (
    <Svg testID={testID} width={size} height={size} viewBox="0 0 138.75 141.25">
      {FRESH_PARTS.map((part) => (
        <Path key={part.d} d={part.d} fill={part.fill} />
      ))}
    </Svg>
  ) : (
    <Svg testID={testID} width={size} height={size} viewBox="0 0 145 140">
      <Path d={ROTTEN_PATH} fill={ROTTEN_COLOR} />
    </Svg>
  );
