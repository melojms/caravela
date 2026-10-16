#!/usr/bin/env node
// Writes src/about/licenses.json: every third-party package in the app's
// Release JS bundle, with its full licence text, for the Licences screen.
//
// The package list comes from the source map that `npm run build:release`
// leaves in build/. That's the bundle as shipped: build-vega leaves the Vega
// system libraries (React, react-navigation, ...) out, because the OS provides
// them, and Metro, Babel and the CLI never reach it. Shaka Player isn't an npm
// package, so it's added from src/vendor/shaka/ (see README).
//
// Usage: node scripts/generate-licenses.mjs [path to the bundle's source map]

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {dirname, isAbsolute, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MAP = 'build/debugging/Release/srcmap/index.bundle.map';
const OUTPUT = join(ROOT, 'src/about/licenses.json');
const SHAKA_DIR = join(ROOT, 'src/vendor/shaka');
const SHAKA_BUILD = join(SHAKA_DIR, 'dist/shaka-player.compiled.js');
// The Vega port's version (docs/PLAN.md); the build itself only says 4.16.13.
const SHAKA = {
  name: 'Shaka Player',
  version: '4.16.13-r1.2',
  license: 'Apache-2.0',
  url: 'https://github.com/shaka-project/shaka-player',
};

function fail(message) {
  console.error(`generate-licenses: ${message}`);
  process.exit(1);
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

// LICENSE, LICENCE.md, license-mit.txt, COPYING, ...
const LICENSE_FILE = /^(licen[cs]e|copying)([-._].*)?$/i;
const NOTICE_FILE = /^notice([-._].*)?$/i;
// THIRD-PARTY-LICENSES.txt, THIRD_PARTY_NOTICES.txt, ...
const THIRD_PARTY_FILE = /^third[-_]party[-_](licen[cs]es|notices)([-._].*)?$/i;

/** The licence files, then NOTICE (Apache only), then third-party notices. */
function licenseText(dir, license) {
  const apache = /apache/i.test(license);
  const rank = (f) =>
    LICENSE_FILE.test(f)
      ? 0
      : apache && NOTICE_FILE.test(f)
      ? 1
      : THIRD_PARTY_FILE.test(f)
      ? 2
      : -1;
  const files = readdirSync(dir)
    .filter((f) => rank(f) >= 0 && statSync(join(dir, f)).isFile())
    .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  return files
    .map((f) =>
      readFileSync(join(dir, f), 'utf8').replace(/\r\n?/g, '\n').trim(),
    )
    .filter(Boolean)
    .join('\n\n');
}

function licenseOf(pkg) {
  const id = (item) => (typeof item === 'string' ? item : item?.type);
  if (pkg.license) {
    return id(pkg.license);
  }
  if (Array.isArray(pkg.licenses)) {
    return pkg.licenses.map(id).filter(Boolean).join(' OR ');
  }
  return undefined;
}

const HOSTS = {
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org',
};

/** A homepage or repository field as an https URL, or undefined. */
function normaliseUrl(value) {
  let url = typeof value === 'string' ? value : value?.url;
  if (!url) {
    return undefined;
  }
  url = url.trim();
  // "github:user/repo", or the bare "user/repo" shorthand.
  const short = url.match(
    /^(?:(github|gitlab|bitbucket):)?([\w.-]+\/[\w.-]+)$/,
  );
  if (short) {
    url = `https://${HOSTS[short[1] ?? 'github']}/${short[2]}`;
  }
  url = url
    .replace(/^git\+/, '')
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/^(git|ssh|http):\/\/(git@)?/, 'https://')
    .replace(/\.git(#.*)?$/, '')
    .replace(/#readme$/, '')
    .replace(/\/$/, '');
  return url.startsWith('https://') ? url : undefined;
}

/** The package directories (node_modules/<pkg> or node_modules/@scope/pkg) in the map's sources. */
function bundledPackageDirs(mapFile) {
  const {sources} = readJson(mapFile);
  const dirs = new Set();
  for (const source of sources) {
    const path = isAbsolute(source)
      ? source
      : resolve(dirname(mapFile), source);
    const at = path.lastIndexOf('/node_modules/');
    if (at < 0) {
      continue;
    }
    if (relative(ROOT, path).startsWith('..')) {
      fail(
        `${mapFile} was built in another directory (${source}). Run \`npm run build:release\` here.`,
      );
    }
    const [first, second] = path.slice(at + '/node_modules/'.length).split('/');
    dirs.add(
      path.slice(0, at + '/node_modules/'.length) +
        (first.startsWith('@') ? `${first}/${second}` : first),
    );
  }
  return dirs;
}

function packageEntry(dir, withoutFile) {
  const pkg = readJson(join(dir, 'package.json'));
  const license = licenseOf(pkg);
  if (!license) {
    fail(
      `${pkg.name}@${pkg.version} (${relative(
        ROOT,
        dir,
      )}) has no license in its package.json.`,
    );
  }
  let text = licenseText(dir, license);
  if (!text) {
    withoutFile.push(`${pkg.name}@${pkg.version}`);
    text = `${pkg.name} is licensed under ${license}. The package ships no licence file.`;
  }
  const url = normaliseUrl(pkg.homepage) ?? normaliseUrl(pkg.repository);
  return {
    name: pkg.name,
    version: pkg.version,
    license,
    text,
    ...(url && {url}),
  };
}

/**
 * Shaka Player's entry. Its licence file, when setup-shaka.sh copied one, then
 * the licence comments the compiled build carries (Shaka's own and those of the
 * code it bundles: Closure, tXml, mux.js, ...). Amazon's polyfills next to it
 * are proprietary and aren't listed.
 */
function shakaEntry() {
  if (!existsSync(SHAKA_BUILD)) {
    fail(
      `no Shaka build at ${relative(
        ROOT,
        SHAKA_BUILD,
      )}. Set up Shaka Player first ("Shaka Player (not included)" in README.md, scripts/setup-shaka.sh).`,
    );
  }
  const build = readFileSync(SHAKA_BUILD, 'utf8');
  const notices = [];
  for (const [comment] of build.matchAll(/\/\*[\s\S]*?\*\//g)) {
    if (!/@license|Copyright|SPDX-License-Identifier/.test(comment)) {
      continue;
    }
    const notice = comment
      .slice(2, -2)
      .replace(/@license/, '')
      .split('\n')
      .map((line) => line.replace(/^ /, '').trimEnd())
      .join('\n')
      .trim();
    if (!notices.includes(notice)) {
      notices.push(notice);
    }
  }
  const file = licenseText(SHAKA_DIR, SHAKA.license);
  return {...SHAKA, text: [file, ...notices].filter(Boolean).join('\n\n')};
}

const mapFile = resolve(ROOT, process.argv[2] ?? DEFAULT_MAP);
if (!existsSync(mapFile)) {
  fail(
    `no source map at ${relative(
      ROOT,
      mapFile,
    )}. Run \`npm run build:release\` first.`,
  );
}
if (
  statSync(mapFile).mtimeMs < statSync(join(ROOT, 'package-lock.json')).mtimeMs
) {
  console.warn(
    `generate-licenses: ${relative(
      ROOT,
      mapFile,
    )} is older than package-lock.json; rebuild with \`npm run build:release\` if dependencies changed.`,
  );
}

const ownName = readJson(join(ROOT, 'package.json')).name;
const withoutFile = [];
const entries = new Map();
for (const dir of [...bundledPackageDirs(mapFile)].sort()) {
  const entry = packageEntry(dir, withoutFile);
  const key = `${entry.name}@${entry.version}`;
  if (entry.name !== ownName && !entries.has(key)) {
    entries.set(key, entry);
  }
}
entries.set('shaka', shakaEntry());

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = [...entries.values()].sort(
  (a, b) => compare(a.name, b.name) || compare(a.version, b.version),
);
const json = `${JSON.stringify(sorted, null, 2)}\n`;
writeFileSync(OUTPUT, json);

console.log(
  `Wrote ${sorted.length} packages to ${relative(ROOT, OUTPUT)} (${Math.round(
    Buffer.byteLength(json) / 1024,
  )} KB).`,
);
if (withoutFile.length > 0) {
  console.log(
    `No licence file shipped: ${[...new Set(withoutFile)].join(', ')}`,
  );
}
