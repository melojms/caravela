import type {NativeStackScreenProps} from '@amazon-devices/react-navigation__native-stack';

import type {LibraryKind} from '../api/libraryTypes';

export type AuthStackParamList = {
  AddServer: undefined;
  UserPicker: {serverId: string};
  Password: {
    serverId: string;
    username?: string;
    userId?: string;
    /** Shown as a banner, e.g. when Quick Connect is turned off. */
    notice?: string;
  };
  QuickConnect: {serverId: string; userId?: string};
};

export type RootStackParamList = AuthStackParamList & {
  Launch: undefined;
  Home: undefined;
  Search: undefined;
  Settings: undefined;
  /** App and server versions, licence, source and privacy links. */
  About: undefined;
  /** The third-party packages, from `src/about/licenses.json`. */
  Licenses: undefined;
  /** One package's full licence text. */
  LicenseText: {name: string; version: string};
  /** A movies or TV shows library's grid. */
  Library: {
    libraryId: string;
    title: string;
    collectionType: LibraryKind;
    displayPreferencesId: string;
  };
  Details: {itemId: string; title: string};
  /** `startMs` is the Resume position, or 0 to play from the start. */
  Player: {itemId: string; title: string; startMs: number};
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
