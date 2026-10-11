# Caravela

A Fire TV (Vega OS) client for movies and TV shows.

Caravela is an unofficial client that works with Jellyfin servers; it is not affiliated with the Jellyfin project.

## Requirements

- Vega SDK 0.24 (`vega` CLI on your `PATH`)
- Node.js ≥ 22.14
- A Fire TV running Vega OS with developer mode on, or the Vega Virtual Device

## Build and run

```sh
npm install
npm run lint
npm test

# Debug build (packages land in build/<arch>-debug/)
npm run build:debug

# Install and launch on the connected device
vega device list
vega device install-app --dir . -b Debug
vega device launch-app --dir .
```

Debug builds load JavaScript from the Metro dev server, so run `npm start` and forward its port to the device first (see the Vega Fast Refresh docs); without it the app starts blank. Release builds bundle the JavaScript and run on their own.

Use `npm run build:release` and `-b Release` for a release build. With more than one device connected, pass `--device <serial>` to the `vega device` commands.

## Shaka Player (not included)

Caravela plays transcoded and remuxed streams (HLS) with Amazon's Vega port of [Shaka Player](https://github.com/shaka-project/shaka-player). **This repository does not include it**, and the app won't build without it:

- Shaka Player itself is Apache-2.0, but Amazon's Vega package also ships polyfills marked "Amazon proprietary/confidential", under Amazon's own licence terms. Those files can't be committed to a GPL repository.
- So each checkout downloads and builds the package locally, and `scripts/setup-shaka.sh` copies the build and the polyfills into `src/vendor/shaka/`, which git ignores.

Set it up once per checkout. It needs Git, Python 3, Java 21+ and Node.js; the build clones upstream Shaka 4.16.13 from GitHub and applies Amazon's patches.

```sh
# Outside the app directory
mkdir -p ../shaka-build && cd ../shaka-build
curl -fLO https://amzndevresources.com/vega/media-player/shaka-rel-v4.16.13-r1.2-devices_scope.tar.gz
tar -xzf shaka-rel-v4.16.13-r1.2-devices_scope.tar.gz
shaka-rel/scripts/setup.sh

# Back in the app directory
scripts/setup-shaka.sh ../shaka-build/shaka-rel
```

Amazon describes the package and its build in [Play adaptive content with Shaka Player](https://developer.amazon.com/docs/vega/latest/media-player-shaka-player.html). Downloading it means accepting Amazon's terms for it.

**If you distribute builds:** a built app contains Amazon's proprietary polyfills, which the GPL doesn't cover. Caravela's licence has a linking exception ([LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md)) that allows this combination on the GPL side, but Amazon's terms still apply to Amazon's files, so check them before you share or publish a build.

## Jellyfin API and saved logins

- **SDK:** `@jellyfin/sdk` 1.0.0, generated from the Jellyfin 12.0 OpenAPI spec. Caravela supports **Jellyfin 12.0 and newer** and rejects older servers when you add them. The SDK and its axios dependency bundle and run under Vega Metro/Hermes (axios uses its `react-native` build).
- **URL polyfill:** Vega's built-in `URL` has no `search` setter, but the SDK's generated client sets `url.search` on every request. `src/api/urlPolyfill.js` replaces the global `URL` and `URLSearchParams` with core-js's versions, and `index.js` imports it first. `react-native-url-polyfill` doesn't work on Vega because it reads `NativeModules.BlobModule` on load, which crashes the bridgeless RN 0.83 runtime.
- **Storage:** servers, users, tokens and the auto-login setting are saved as one JSON entry in AsyncStorage, using Vega's port `@amazon-devices/react-native-async-storage__async-storage` ~2.1. Vega has no secure key/value store for apps, so **access tokens are stored unencrypted** in the app's sandboxed SQLite database. The store sits behind the `AuthStore` interface, so it can move to secure storage if Vega adds one.

## License

GPL-2.0-or-later: you can redistribute and modify Caravela under the terms of the GNU General Public License, version 2 or (at your option) any later version. See [LICENSE](LICENSE). As an additional permission, Caravela may be combined and distributed with Amazon's Vega media libraries and its Shaka Player port; see [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md). Amazon's Shaka Player polyfills aren't part of this repository and aren't covered by this licence; see [Shaka Player (not included)](#shaka-player-not-included).
