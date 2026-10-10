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

Use `npm run build:release` and `-b Release` for a release build. With more than one device connected, pass `--device <serial>` to the `vega device` commands.

## Jellyfin API and saved logins

- **SDK:** `@jellyfin/sdk` 0.13.0, the release generated from the Jellyfin 10.11 OpenAPI spec. Caravela rejects servers older than 10.11.0, the same minimum as jellyfin-androidtv. The SDK and its axios dependency bundle and run under Vega Metro/Hermes (axios uses its `react-native` build).
- **URL polyfill:** Vega's built-in `URL` has no `search` setter, but the SDK's generated client sets `url.search` on every request. `src/api/urlPolyfill.js` replaces the global `URL` and `URLSearchParams` with core-js's versions, and `index.js` imports it first. `react-native-url-polyfill` doesn't work on Vega because it reads `NativeModules.BlobModule` on load, which crashes the bridgeless RN 0.83 runtime.
- **Storage:** servers, users, tokens and the auto-login setting are saved as one JSON entry in AsyncStorage, using Vega's port `@amazon-devices/react-native-async-storage__async-storage` ~2.1. Vega has no secure key/value store for apps, so **access tokens are stored unencrypted** in the app's sandboxed SQLite database. The store sits behind the `AuthStore` interface, so it can move to secure storage if Vega adds one.

## License

GPL-2.0. See [LICENSE](LICENSE).
