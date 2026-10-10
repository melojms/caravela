import type {NativeStackScreenProps} from '@amazon-devices/react-navigation__native-stack';

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
  Movies: undefined;
  Shows: undefined;
  Details: {itemId: string; title: string};
  DetailsPlaceholder: {itemId: string; title: string};
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
