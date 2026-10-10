import type {BottomTabScreenProps} from '@amazon-devices/react-navigation__bottom-tabs';
import type {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@amazon-devices/react-navigation__native';
import type {NativeStackScreenProps} from '@amazon-devices/react-navigation__native-stack';

export type MenuParamList = {
  Home: undefined;
  Movies: undefined;
  Shows: undefined;
  Search: undefined;
  Settings: undefined;
};

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
  Main: NavigatorScreenParams<MenuParamList> | undefined;
  DetailsPlaceholder: {itemId: string; title: string};
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type MenuScreenProps<T extends keyof MenuParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MenuParamList, T>,
    RootStackScreenProps<keyof RootStackParamList>
  >;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
