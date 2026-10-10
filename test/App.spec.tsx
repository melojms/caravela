import 'react-native';
import {render} from '@testing-library/react-native';
import * as React from 'react';

import {App} from '../src/App';

describe('App', () => {
  it('renders the Caravela splash', () => {
    const screen = render(<App />);
    expect(screen.getByTestId('splash-icon')).toBeTruthy();
    expect(screen.getByText('Caravela')).toBeTruthy();
  });
});
