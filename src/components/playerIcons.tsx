import {Path, Svg} from '@amazon-devices/react-native-svg';
import React from 'react';

/** The player overlay's button icons. */
export type PlayerIconName =
  | 'play'
  | 'pause'
  | 'rewind'
  | 'fastforward'
  | 'subtitles'
  | 'audio'
  | 'chapters'
  | 'speed'
  | 'zoom';

// Vector paths ported from androidtv's res/drawable (24x24 viewport), the
// ones its playback actions use.
const PLAYER_PATHS: Record<PlayerIconName, string> = {
  // ic_play
  play: 'm8,5v14l11,-7z',
  // ic_pause
  pause: 'M6,19h4L10,5L6,5v14zM14,5v14h4L18,5h-4z',
  // ic_rewind
  rewind: 'M11,18L11,6l-8.5,6 8.5,6zM11.5,12l8.5,6L20,6l-8.5,6z',
  // ic_fast_forward
  fastforward: 'M4,18l8.5,-6L4,6v12zM13,6v12l8.5,-6L13,6z',
  // ic_select_subtitle: a CC box
  subtitles:
    'M19,4L5,4c-1.11,0 -2,0.9 -2,2v12c0,1.1 0.89,2 2,2h14c1.1,0 2,-0.9 2,-2L21,6c0,-1.1 -0.9,-2 -2,-2zM11,11L9.5,11v-0.5h-2v3h2L9.5,13L11,13v1c0,0.55 -0.45,1 -1,1L7,15c-0.55,0 -1,-0.45 -1,-1v-4c0,-0.55 0.45,-1 1,-1h3c0.55,0 1,0.45 1,1v1zM18,11h-1.5v-0.5h-2v3h2L16.5,13L18,13v1c0,0.55 -0.45,1 -1,1h-3c-0.55,0 -1,-0.45 -1,-1v-4c0,-0.55 0.45,-1 1,-1h3c0.55,0 1,0.45 1,1v1z',
  // ic_select_audio: a note
  audio:
    'M12,3v9.28c-0.47,-0.17 -0.97,-0.28 -1.5,-0.28C8.01,12 6,14.01 6,16.5S8.01,21 10.5,21c2.31,0 4.2,-1.75 4.45,-4H15V6h4V3h-7z',
  // ic_select_chapter: a clapperboard
  chapters:
    'M18,4l2,4h-3l-2,-4h-2l2,4h-3l-2,-4H8l2,4H7L5,4H4c-1.1,0 -1.99,0.9 -1.99,2L2,18c0,1.1 0.9,2 2,2h16c1.1,0 2,-0.9 2,-2V4h-4z',
  // ic_playback_speed
  speed:
    'M13.05,9.79L10,7.5v9l3.05,-2.29L16,12zM11,4.07L11,2.05c-2.01,0.2 -3.84,1 -5.32,2.21L7.1,5.69c1.11,-0.86 2.44,-1.44 3.9,-1.62zM5.69,7.1L4.26,5.68C3.05,7.16 2.25,8.99 2.05,11h2.02c0.18,-1.46 0.76,-2.79 1.62,-3.9zM4.07,13L2.05,13c0.2,2.01 1,3.84 2.21,5.32l1.43,-1.43c-0.86,-1.1 -1.44,-2.43 -1.62,-3.89zM5.68,19.74C7.16,20.95 9,21.75 11,21.95v-2.02c-1.46,-0.18 -2.79,-0.76 -3.9,-1.62l-1.42,1.43zM22,12c0,5.16 -3.92,9.42 -8.95,9.95v-2.02C16.97,19.41 20,16.05 20,12s-3.03,-7.41 -6.95,-7.93L13.05,2.05C18.08,2.58 22,6.84 22,12z',
  // ic_aspect_ratio
  zoom: 'M19,12h-2v3h-3v2h5v-5zM7,9h3L10,7L5,7v5h2L7,9zM21,3L3,3c-1.1,0 -2,0.9 -2,2v14c0,1.1 0.9,2 2,2h18c1.1,0 2,-0.9 2,-2L23,5c0,-1.1 -0.9,-2 -2,-2zM21,19.01L3,19.01L3,4.99h18v14.02z',
};

export const PlayerIcon = ({
  icon,
  color,
  size,
  testID,
}: {
  icon: PlayerIconName;
  color: string;
  size: number;
  testID?: string;
}) => (
  <Svg testID={testID} width={size} height={size} viewBox="0 0 24 24">
    <Path d={PLAYER_PATHS[icon]} fill={color} />
  </Svg>
);
