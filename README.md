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

## License

GPL-2.0. See [LICENSE](LICENSE).
