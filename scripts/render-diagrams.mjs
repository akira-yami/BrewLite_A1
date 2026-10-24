import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(root, 'docs/architecture/diagrams');
const jar = process.argv[2];
if (!jar) throw new Error('Usage: node scripts/render-diagrams.mjs <plantuml-1.2026.8.jar>');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jarSha = '5e1ecfa8ecd32c90b03bbf3b1eb6f020943f98ab0fcf4032be31a0002ee2c462';
if (sha(readFileSync(jar)) !== jarSha) throw new Error('Unexpected PlantUML jar SHA-256');
const entries = [];
for (const source of readdirSync(directory).filter((f) => f.endsWith('.puml')).sort()) {
  const input = readFileSync(resolve(directory, source), 'utf8').replaceAll('\r\n', '\n');
  const outputs = {};
  for (const format of ['svg', 'png']) {
    // Pipe output avoids @startuml aliases silently changing the output filename.
    const result = spawnSync('java', ['-Djava.awt.headless=true', '-DPLANTUML_LIMIT_SIZE=16000',
      '-jar', resolve(jar), '-charset', 'UTF-8', '-failfast2', `-t${format}`, '-pipe'],
    { input: Buffer.from(input), maxBuffer: 40 * 1024 * 1024 });
    if (result.error || result.status !== 0) {
      throw new Error(`${source}: ${result.error ?? result.stderr?.toString()}`);
    }
    const output = source.replace(/\.puml$/, `.${format}`);
    writeFileSync(resolve(directory, output), result.stdout);
    outputs[output] = sha(result.stdout);
  }
  entries.push({ source, sha256: sha(input), outputs });
  console.log(`Rendered ${source}`);
}
writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify({
  version: 1, renderer: 'PlantUML 1.2026.8 / Java 27 / Arial (Windows)',
  jarSha256: jarSha, sourceNormalization: 'UTF-8, CRLF -> LF', entries,
}, null, 2) + '\n');
