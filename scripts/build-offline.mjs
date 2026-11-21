import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const files = (await readdir('dist', { recursive: true, withFileTypes: true }))
  .filter(file => file.isFile() && file.name !== 'sw.js')
  .map(file => `${file.parentPath}/${file.name}`.slice('dist/'.length))
  .sort();
const hash = createHash('sha256');
const worker = await readFile('scripts/service-worker.js', 'utf8');
hash.update(worker);
for (const file of files) hash.update(file).update(await readFile(`dist/${file}`));

await writeFile('dist/sw.js', `const revision = "${hash.digest('hex').slice(0, 16)}";\nconst files = ${JSON.stringify(files)};\n${worker}`);
