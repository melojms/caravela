import 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';

import {ContentRow} from '../src/components/ContentRow';
import {CardItem} from '../src/components/types';

const items: CardItem[] = [
  {id: 'a', title: 'Alpha', progress: 0.4},
  {id: 'b', title: 'Bravo', played: true},
  {id: 'c', title: 'Charlie'},
];

describe('ContentRow', () => {
  it('renders the title and one card per item', () => {
    const screen = render(
      <ContentRow testID="row" title="Latest Movies" items={items} />,
    );

    expect(screen.getByText('Latest Movies')).toBeTruthy();
    expect(screen.getByTestId('row-item-0')).toBeTruthy();
    expect(screen.getByTestId('row-item-1')).toBeTruthy();
    expect(screen.getByTestId('row-item-2')).toBeTruthy();
    expect(screen.getByTestId('card-progress')).toBeTruthy();
    expect(screen.getByTestId('card-played')).toBeTruthy();
  });

  it('passes the pressed item back', () => {
    const onItemPress = jest.fn();
    const screen = render(
      <ContentRow
        testID="row"
        title="Row"
        items={items}
        onItemPress={onItemPress}
      />,
    );

    fireEvent.press(screen.getByTestId('row-item-1'));
    expect(onItemPress).toHaveBeenCalledWith(items[1]);
  });

  it('renders nothing for an empty row', () => {
    const screen = render(<ContentRow testID="row" title="Empty" items={[]} />);
    expect(screen.queryByText('Empty')).toBeNull();
  });
});
