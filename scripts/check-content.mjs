import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const languages = Object.keys(await readJson('src/languages.json'));
const themes = ['stories', 'animal_facts', 'around_the_world', 'amazing_science', 'nature_seasons'];
const source = process.argv[2];
const revision = process.argv[3] ?? '5504627c69f04c27b9f6c56dee509792cf5920d6';
const readSource = path => execFileSync('git', ['show', `${revision}:${path}`], {
  cwd: source, encoding: 'utf8',
});

if (source) {
  assert.match(revision, /^[0-9a-f]{40}$/, 'Use the full Text Generator commit SHA');
  const registry = readSource('src/languages.js');
  const registered = [...registry.matchAll(/Object\.freeze\(\{ code: '([a-z]{2})', name: /g)].map(match => match[1]);
  assert.deepEqual(registered.sort(), [...languages].sort(), 'Text Generator language registry differs');
}

const files = await readdir(new URL('content/', root));
assert.deepEqual(files.filter(file => file.endsWith('.json')).sort(), languages.map(code => `${code}.json`).sort());
let count = 0;

for (const language of languages) {
  const path = `content/${language}.json`;
  const pack = await readJson(path);
  assert.equal(pack.language, language, path);
  assert.equal(pack.schemaVersion, 1, path);
  const knownIds = new Set();
  const coverage = new Set();

  for (const entry of pack.entries) {
    const label = `${language}/${entry.id}`;
    assert.match(entry.id, /^[\p{L}\p{M}\p{N}_-]+$/u, label);
    assert.ok(!knownIds.has(entry.id), `Duplicate entry ${label}`);
    knownIds.add(entry.id);
    assert.equal(entry.review.status, 'reviewed', label);
    assert.ok(Number.isInteger(entry.version) && entry.version > 0, label);
    assert.ok(entry.title.trim() && entry.body.trim(), label);
    assert.equal(entry.syllable_body.replaceAll('|', ''), entry.body, `Syllable text differs in ${label}`);
    assert.ok(Number.isInteger(entry.level) && entry.level >= 1 && entry.level <= 5, label);
    assert.ok(themes.includes(entry.theme), label);
    coverage.add(`${entry.theme}/${entry.level}`);
  }
  assert.equal(coverage.size, themes.length * 5, `Missing theme or level in ${language}`);
  count += pack.entries.length;

  if (source) {
    const upstream = JSON.parse(readSource(path));
    const approved = upstream.entries.filter(entry => entry.review.status === 'reviewed')
      .map(({ imageId, ...entry }) => entry);
    assert.deepEqual(pack, { ...upstream, entries: approved }, `Approved snapshot differs for ${language}`);
  }
}

console.log(`Validated ${count} reviewed passages in ${languages.length} languages${source ? ` against Text Generator ${revision.slice(0, 7)}` : ''}.`);
