/** One third-party package on the Licences screen, from `src/about/licenses.json`. */
export interface LicenseEntry {
  name: string;
  version: string;
  /** SPDX expression from the package's package.json, e.g. "MIT" or "(MIT OR Apache-2.0)". */
  license: string;
  /** Full licence text as shipped in the package; several files are joined. */
  text: string;
  /** Homepage or repository URL, when the package lists one. */
  url?: string;
}
