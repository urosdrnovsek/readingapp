import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const files = (await readdir('dist', { recursive: true, withFileTypes: true }))
  .filter(file => file.isFile() && file.name !== 'sw.js')
  .map(file => `${file.parentPath}/${file.name}`.slice('dist/'.length))
  .sort();
const hash = createHash('sha256');
const worker = await readFile('scripts/service-worker.js', 'utf8');
hash.update(worker);
const digests = {};
for (const file of files) {
  const bytes = await readFile(`dist/${file}`);
  hash.update(file).update(bytes);
  digests[file] = createHash('sha256').update(bytes).digest('hex');
}

await writeFile('dist/sw.js', `const revision = "${hash.digest('hex').slice(0, 16)}";\nconst files = ${JSON.stringify(digests)};\n${worker}`);
