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
};
