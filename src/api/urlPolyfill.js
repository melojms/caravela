/**
 * Replaces the global URL and URLSearchParams with core-js's spec-compliant
 * versions. Import this before anything that loads @jellyfin/sdk.
 *
 * Vega's URL has no `search` setter, and the SDK's generated client sets
 * `url.search` on every request. react-native-url-polyfill can't be used:
 * it reads `NativeModules.BlobModule` on load, which throws on Vega's
 * bridgeless RN 0.83.
 */
import URLPolyfill from 'core-js-pure/actual/url';
import URLSearchParamsPolyfill from 'core-js-pure/actual/url-search-params';

global.URL = URLPolyfill;
global.URLSearchParams = URLSearchParamsPolyfill;
