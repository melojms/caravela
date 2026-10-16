import {act, fireEvent, render, screen} from '@testing-library/react-native';
import React from 'react';

import type {LicenseEntry} from '../../src/about/types';
import {
  chunkLicenseText,
  LICENSE_CHUNK_LIMIT,
  LicensesScreen,
  LicenseTextScreen,
} from '../../src/screens/LicensesScreen';

const FAKE_LICENSES: LicenseEntry[] = [
  {
    name: '@amazon-devices/fake-api',
    version: '1.2.5',
    license: 'See license in LICENSE',
    text: 'Amazon licence.',
  },
  {
    name: '@jellyfin/sdk',
    version: '1.0.0',
    license: 'MPL-2.0',
    text: [
      'Mozilla Public License Version 2.0',
      '==================================',
      '',
      '1. Definitions',
      '',
      '  1.1. "Contributor"',
      '  means each individual or legal entity.',
    ].join('\n'),
    url: 'https://github.com/jellyfin/jellyfin-sdk-typescript',
  },
  {
    name: 'whatwg-fetch',
    version: '3.6.20',
    license: 'MIT',
    text: 'Copyright (c) 2014-2023 GitHub, Inc.',
    url: 'https://github.com/github/fetch',
  },
];

// The screens read the list on each render, so a test can swap in the real one.
let mockLicenses: readonly LicenseEntry[] = FAKE_LICENSES;
jest.mock('../../src/about/thirdPartyLicenses', () => ({
  get LICENSES() {
    return mockLicenses;
  },
}));

const {LICENSES: REAL_LICENSES} = jest.requireActual<{
  LICENSES: readonly LicenseEntry[];
}>('../../src/about/thirdPartyLicenses');

/** The text's non-blank lines: what the chunks must keep, in order. */
const nonBlankLines = (text: string) =>
  text.split('\n').filter((line) => line.trim() !== '');

let navigate: jest.Mock;

const renderList = () =>
  render(
    <LicensesScreen
      navigation={{navigate} as never}
      route={{key: 'Licenses', name: 'Licenses'} as never}
    />,
  );

const renderText = (name: string, version: string) =>
  render(
    <LicenseTextScreen
      navigation={{navigate} as never}
      route={
        {
          key: 'LicenseText',
          name: 'LicenseText',
          params: {name, version},
        } as never
      }
    />,
  );

beforeEach(() => {
  navigate = jest.fn();
  mockLicenses = FAKE_LICENSES;
});

describe('LicensesScreen', () => {
  it('lists every package with its version and licence', () => {
    renderList();

    expect(screen.getByTestId('licenses-screen')).toBeTruthy();
    expect(screen.getByText('Third-party licences')).toBeTruthy();
    expect(
      screen.getByText(
        'Caravela includes these packages. Select one to read its licence.',
      ),
    ).toBeTruthy();
    expect(screen.getAllByTestId(/^licenses-row-\d+$/)).toHaveLength(3);
    expect(screen.getByTestId('licenses-row-0')).toHaveTextContent(
      '@amazon-devices/fake-api 1.2.5',
      {exact: false},
    );
    // Amazon's own licence has no SPDX ID.
    expect(screen.getByTestId('licenses-row-0')).toHaveTextContent(
      'See licence text',
      {exact: false},
    );
    expect(screen.getByTestId('licenses-row-1')).toHaveTextContent(
      '@jellyfin/sdk 1.0.0',
      {exact: false},
    );
    expect(screen.getByTestId('licenses-row-1')).toHaveTextContent('MPL-2.0', {
      exact: false,
    });
    expect(screen.getByTestId('licenses-row-2')).toHaveTextContent('MIT', {
      exact: false,
    });
    expect(screen.queryByText(/See license in LICENSE/)).toBeNull();
  });

  it('focuses the first row on open', () => {
    renderList();

    expect(screen.getByTestId('licenses-row-0').props.hasTVPreferredFocus).toBe(
      true,
    );
    expect(
      screen.getByTestId('licenses-row-1').props.hasTVPreferredFocus,
    ).toBeFalsy();
  });

  it("opens a package's licence text", async () => {
    renderList();

    await act(async () => {
      fireEvent.press(screen.getByTestId('licenses-row-1'));
    });
    expect(navigate).toHaveBeenCalledWith('LicenseText', {
      name: '@jellyfin/sdk',
      version: '1.0.0',
    });
  });

  it('lists the real packages', () => {
    mockLicenses = REAL_LICENSES;
    renderList();

    const rows = screen.getAllByTestId(/^licenses-row-\d+$/);
    expect(rows).toHaveLength(REAL_LICENSES.length);
    expect(rows[rows.length - 1]).toHaveTextContent('whatwg-fetch', {
      exact: false,
    });
  });
});

describe('LicenseTextScreen', () => {
  it('shows the title, licence, url and the whole text', () => {
    renderText('@jellyfin/sdk', '1.0.0');

    expect(screen.getByTestId('license-text-screen')).toBeTruthy();
    expect(screen.getByText('@jellyfin/sdk 1.0.0')).toBeTruthy();
    expect(screen.getByTestId('license-text-license')).toHaveTextContent(
      'Licence: MPL-2.0',
    );
    expect(screen.getByTestId('license-text-url')).toHaveTextContent(
      'https://github.com/jellyfin/jellyfin-sdk-typescript',
    );

    const chunks = screen
      .getAllByTestId(/^license-text-chunk-\d+$/)
      .map((chunk) => screen.getByTestId(`${chunk.props.testID}-text`))
      .map((text) => text.props.children as string);
    expect(chunks.length).toBeGreaterThan(0);
    expect(nonBlankLines(chunks.join('\n'))).toEqual(
      nonBlankLines(FAKE_LICENSES[1].text),
    );
  });

  it('focuses the first chunk on open', () => {
    renderText('@jellyfin/sdk', '1.0.0');

    expect(
      screen.getByTestId('license-text-chunk-0').props.hasTVPreferredFocus,
    ).toBe(true);
  });

  it("shows Amazon's licence as the licence text", () => {
    renderText('@amazon-devices/fake-api', '1.2.5');

    expect(screen.getByTestId('license-text-license')).toHaveTextContent(
      'Licence: See licence text',
    );
    expect(screen.queryByTestId('license-text-url')).toBeNull();
    expect(screen.getByText('Amazon licence.')).toBeTruthy();
  });

  it('says so for an unknown package', () => {
    renderText('@jellyfin/sdk', '9.9.9');

    expect(screen.getByTestId('license-text-not-found')).toHaveTextContent(
      'Licence not found',
    );
    expect(screen.queryByTestId(/^license-text-chunk-/)).toBeNull();
  });
});

describe('chunkLicenseText', () => {
  it('merges small paragraphs, keeping the blank line between them', () => {
    expect(chunkLicenseText('MIT License\n\nCopyright (c) Someone')).toEqual([
      'MIT License\n\nCopyright (c) Someone',
    ]);
  });

  it('starts a new chunk when the next paragraph would go over the limit', () => {
    expect(chunkLicenseText('aaaa\n\nbbbb\n\ncccc', 10)).toEqual([
      'aaaa\n\nbbbb',
      'cccc',
    ]);
  });

  it('splits an oversized paragraph on its line breaks', () => {
    expect(chunkLicenseText('aaaa\nbbbb\ncccc', 10)).toEqual([
      'aaaa\nbbbb',
      'cccc',
    ]);
  });

  it('keeps a line longer than the limit whole', () => {
    expect(chunkLicenseText('aaaaaaaa\nbb\n\ncc', 5)).toEqual([
      'aaaaaaaa',
      'bb',
      'cc',
    ]);
  });

  it('keeps line breaks and indentation inside a chunk', () => {
    expect(chunkLicenseText('Title\n  indented\nnext')).toEqual([
      'Title\n  indented\nnext',
    ]);
  });

  it('drops blank lines at the edges and never returns an empty chunk', () => {
    const chunks = chunkLicenseText('\n\n  \nA\n\n \n\n\nB\n\n', 1);
    expect(chunks).toEqual(['A', 'B']);
    expect(chunkLicenseText('')).toEqual([]);
    expect(chunkLicenseText(' \n\n ')).toEqual([]);
  });

  it('chunks every real licence within the limit and loses no line', () => {
    for (const entry of REAL_LICENSES) {
      const chunks = chunkLicenseText(entry.text);
      for (const chunk of chunks) {
        expect(chunk.trim()).not.toBe('');
        // Only a single line may go over the limit.
        if (chunk.length > LICENSE_CHUNK_LIMIT) {
          expect(chunk).not.toContain('\n');
        }
      }
      expect(nonBlankLines(chunks.join('\n'))).toEqual(
        nonBlankLines(entry.text),
      );
    }
  });

  it('chunks the 300 KB licence into many small pieces', () => {
    const big = REAL_LICENSES.find(
      (entry) => entry.name === '@amazon-devices/keplerscript-turbomodule-api',
    );
    expect(big?.text.length).toBeGreaterThan(250_000);
    const chunks = chunkLicenseText(big!.text);
    expect(chunks.length).toBeGreaterThan(
      big!.text.length / LICENSE_CHUNK_LIMIT,
    );
    const longest = chunks
      .filter((chunk) => chunk.includes('\n'))
      .reduce((max, chunk) => Math.max(max, chunk.length), 0);
    expect(longest).toBeLessThanOrEqual(LICENSE_CHUNK_LIMIT);
  });
});
