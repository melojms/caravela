import packageJson from '../../package.json';
import packageLock from '../../package-lock.json';
import {LICENSES} from '../../src/about/licenses';

/**
 * Direct dependencies that aren't in the app's JS bundle. The Vega system
 * libraries ship with the OS: build-vega leaves them out of the bundle (see
 * build/lib/rn-bundles/Release/system-bundle-app-dependencies.json), and React
 * comes with the system's react-native-kepler. `react-native` imports are
 * rewritten to @amazon-devices/react-native-kepler, which is listed itself.
 * recyclerlistview is vega-carousel's JS list; the bundle only has its native
 * carousel.
 */
const NOT_BUNDLED = new Set([
  'react',
  'react-native',
  '@amazon-devices/react-native-localize',
  '@amazon-devices/react-native-safe-area-context',
  '@amazon-devices/react-native-screens',
  '@amazon-devices/react-native-svg',
  '@amazon-devices/react-native-w3cmedia',
  '@amazon-devices/react-navigation__native',
  '@amazon-devices/react-navigation__native-stack',
  '@react-native-async-storage/async-storage',
  'recyclerlistview',
]);

const key = (name: string, version: string) => `${name}@${version}`;
// package-lock.json drops semver build metadata (4.0.1+rn0.83.0 -> 4.0.1).
const withoutBuild = (version: string) => version.replace(/\+.*$/, '');
const lockPackages: Record<string, {name?: string; version: string}> =
  packageLock.packages;

describe('LICENSES', () => {
  it('has a name, version, licence and text for every entry', () => {
    expect(LICENSES.length).toBeGreaterThan(0);
    for (const entry of LICENSES) {
      expect(entry.name.trim()).not.toBe('');
      expect(entry.version.trim()).not.toBe('');
      expect(entry.license.trim()).not.toBe('');
      expect(entry.text.trim()).not.toBe('');
    }
  });

  it('has no duplicate name and version', () => {
    const keys = LICENSES.map((e) => key(e.name, e.version));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is sorted by name, then version', () => {
    const sorted = [...LICENSES].sort(
      (a, b) =>
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
        (a.version < b.version ? -1 : a.version > b.version ? 1 : 0),
    );
    expect(LICENSES.map((e) => key(e.name, e.version))).toEqual(
      sorted.map((e) => key(e.name, e.version)),
    );
  });

  it('lists every bundled runtime dependency at its installed version', () => {
    const listed = new Set(
      LICENSES.map((e) => key(e.name, withoutBuild(e.version))),
    );

    const missing = Object.keys(packageJson.dependencies)
      .filter((name) => !NOT_BUNDLED.has(name))
      .map((name) => {
        const installed = lockPackages[`node_modules/${name}`];
        // An npm alias records the real package's name.
        return key(installed.name ?? name, withoutBuild(installed.version));
      })
      .filter((k) => !listed.has(k));

    if (missing.length > 0) {
      throw new Error(
        `src/about/licenses.json is out of date (missing ${missing.join(
          ', ',
        )}). Run \`npm run build:release\`, then \`npm run licenses\`.`,
      );
    }
  });

  it('includes Shaka Player under Apache-2.0', () => {
    const shaka = LICENSES.find((e) => e.name === 'Shaka Player');
    expect(shaka).toEqual(
      expect.objectContaining({
        version: '4.16.13-r1.2',
        license: 'Apache-2.0',
        url: 'https://github.com/shaka-project/shaka-player',
      }),
    );
    expect(shaka?.text).toContain('Apache');
  });
});
