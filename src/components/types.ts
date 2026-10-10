/** View model shared by ContentRow and PosterGrid. */
export type CardItem = {
  id: string;
  title: string;
  subtitle?: string;
  imageUri?: string;
  placeholderColor?: string;
  /** Watch progress, 0..1. Renders a progress bar when > 0. */
  progress?: number;
  played?: boolean;
  /** Backdrops for the background behind Home: the item's, then its parent's. */
  backdropUris?: string[];
};

/** One entry in the details info row, in androidtv's order. */
export type InfoRowEntry =
  /** Plain text, e.g. the premiere date or the age rating. */
  | {kind: 'text'; text: string}
  /** Community rating, 0..10. Shown with a star. */
  | {kind: 'communityRating'; value: number}
  /** Critic rating, 0..100. Shown as a percentage, fresh at 60 and up. */
  | {kind: 'criticRating'; value: number}
  /** Boxed media badge, e.g. "1080p", "HDR10", "EAC3", "5.1". */
  | {kind: 'badge'; text: string};

/** A label/value pair under the overview, e.g. "Directed by" / "Jane Doe". */
export type DetailsInfoItem = {label: string; value: string};

export type DetailsActionIcon = 'resume' | 'play' | 'watched' | 'favorite';

/** A button in the details action row: icon above its label. */
export type DetailsAction = {
  key: string;
  label: string;
  icon: DetailsActionIcon;
  /** Toggle buttons (Watched, Favorite) that are on. */
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
};
