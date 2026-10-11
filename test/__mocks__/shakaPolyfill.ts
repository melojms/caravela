/* eslint-env jest */
// Stand-in for each of Amazon's Shaka polyfills (src/vendor/shaka/polyfills/,
// gitignored). jest.config.json maps all of them here, so they share one
// `install` spy.
export default class Polyfill {
  static install = jest.fn();
}
