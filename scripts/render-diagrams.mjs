import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jar = process.argv[2];
if (!jar) throw new Error('Usage: node scripts/render-diagrams.mjs <plantuml-1.2026.8.jar>');
// Render the current database ERD by default; an explicit manifest keeps support
// for other diagram packages without depending on removed A2 directories.
const manifestPath = resolve(root, process.argv[3] ?? 'database/manifest.json');
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : { entries: [{ source: 'database/BrewLite.puml' }] };
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jarSha = '5e1ecfa8ecd32c90b03bbf3b1eb6f020943f98ab0fcf4032be31a0002ee2c462';
if (sha(readFileSync(jar)) !== jarSha) throw new Error('Unexpected PlantUML jar SHA-256');
const entries = [];
for (const source of manifest.entries.map((entry) => entry.source).sort()) {
  const input = readFileSync(resolve(root, source), 'utf8').replaceAll('\r\n', '\n');
  const outputs = {};
  for (const format of ['svg', 'png']) {
    // Pipe output avoids @startuml aliases silently changing the output filename.
    const result = spawnSync(process.env.JAVA_BINARY ?? 'java', ['-Djava.awt.headless=true', '-DPLANTUML_LIMIT_SIZE=16000',
      '-jar', resolve(jar), '-charset', 'UTF-8', '-failfast2', `-t${format}`, '-pipe'],
    { input: Buffer.from(input), maxBuffer: 40 * 1024 * 1024 });
    if (result.error || result.status !== 0) {
      throw new Error(`${source}: ${result.error ?? result.stderr?.toString()}`);
    }
    const output = source.replace(/\.puml$/, `.${format}`);
    writeFileSync(resolve(root, output), result.stdout);
    outputs[output] = sha(result.stdout);
  }
  entries.push({ source, sha256: sha(input), outputs });
  console.log(`Rendered ${source}`);
}
writeFileSync(manifestPath, JSON.stringify({
  version: 2, pathBase: 'repository', renderer: 'PlantUML 1.2026.8 / Java 27 / Arial (Windows)',
  jarSha256: jarSha, sourceNormalization: 'UTF-8, CRLF -> LF', entries,
}, null, 2) + '\n');
