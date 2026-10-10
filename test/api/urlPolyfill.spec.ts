describe('urlPolyfill', () => {
  const original = {URL: global.URL, URLSearchParams: global.URLSearchParams};
  afterEach(() => Object.assign(global, original));

  it('installs a URL whose search can be set, as the Jellyfin SDK needs', () => {
    // Simulate Vega: a URL with a getter-only `search`.
    class GetterOnlyURL {
      get search() {
        return '';
      }
    }
    global.URL = GetterOnlyURL as unknown as typeof URL;

    jest.isolateModules(() => require('../../src/api/urlPolyfill'));

    // RN's URL typings omit `search` and `pathname`.
    const url = new URL('/Users/Me', 'https://example.com') as unknown as {
      search: string;
      pathname: string;
    };
    url.search = new URLSearchParams({a: '1', b: 'x y'}).toString();
    expect(url.pathname + url.search).toBe('/Users/Me?a=1&b=x+y');
    expect(global.URL).not.toBe(GetterOnlyURL);
  });
});
