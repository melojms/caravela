import type {Api} from '@jellyfin/sdk';
import type {BaseItemDto} from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {ImageType} from '@jellyfin/sdk/lib/generated-client/models/image-type';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import React, {ReactNode, useCallback, useRef} from 'react';
import {ScrollView, StyleSheet} from 'react-native';

import {ImageSize, imageUrl} from '../../api/items';
import {Backdrop} from '../../components/Backdrop';
import {DetailsActions} from '../../components/DetailsActions';
import {
  DetailsHeader,
  DetailsHeaderProps,
} from '../../components/DetailsHeader';
import {DetailsAction} from '../../components/types';
import {layout, spacing} from '../../theme';
import {ScreenContainer} from '../ScreenContainer';

/** The item's Primary image (the header poster), if it has one. */
export const primaryImageUri = (
  item: BaseItemDto,
  api: Api,
  size: ImageSize,
): string | undefined => {
  const tag = item.ImageTags?.[ImageType.Primary];
  return tag && item.Id
    ? imageUrl(api, {itemId: item.Id, type: ImageType.Primary, tag}, size)
    : undefined;
};

export type DetailsLayoutProps = {
  testID: string;
  backdropUri?: string;
  header: DetailsHeaderProps;
  /** Empty for pages without buttons (people); the page then focuses a row. */
  actions: DetailsAction[];
  /** The content rows, below the buttons. */
  children?: ReactNode;
};

/**
 * The layout every details page shares, after androidtv's FullDetailsFragment:
 * the blurred backdrop, the header, the action buttons, then the page's rows.
 */
export const DetailsLayout = ({
  testID,
  backdropUri,
  header,
  actions,
  children,
}: DetailsLayoutProps) => {
  // Only the first action on open takes focus. If it goes away later (Resume
  // after marking watched), the new first button mustn't grab focus. A page
  // that opens with no actions never focuses one.
  const initialFirst = useRef(actions[0]?.key);

  // Like androidtv's overview row: when the buttons get focus again (Up from
  // the rows), the whole header scrolls back into view.
  const scrollRef = useRef<ScrollView>(null);
  const scrollToTop = useCallback(
    () => scrollRef.current?.scrollTo({y: 0}),
    [],
  );

  return (
    <ScreenContainer
      background={<Backdrop uri={backdropUri} />}
      testID={testID}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        <DetailsHeader {...header} />
        {actions.length > 0 ? (
          // Up from a card anywhere in the rows lands on the buttons.
          <TVFocusGuideView
            autoFocus
            style={styles.actions}
            onFocus={scrollToTop}>
            <DetailsActions
              actions={actions}
              hasTVPreferredFocus={
                initialFirst.current !== undefined &&
                actions[0].key === initialFirst.current
              }
            />
          </TVFocusGuideView>
        ) : null}
        {children}
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingRight: layout.screenPadding,
    paddingBottom: spacing.xxl,
  },
  actions: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
});
