import {MenuParamList} from './types';

export type MenuEntry = {route: keyof MenuParamList; label: string};

export const MENU_ENTRIES: readonly MenuEntry[] = [
  {route: 'Home', label: 'Home'},
  {route: 'Movies', label: 'Movies'},
  {route: 'Shows', label: 'Shows'},
  {route: 'Search', label: 'Search'},
  {route: 'Settings', label: 'Settings'},
];
