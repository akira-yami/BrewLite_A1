import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const read = (path) => readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)]);
const markdown = [resolve(root, 'README.md'), ...walk(resolve(root, 'docs')).filter((f) => f.endsWith('.md'))];
let links = 0;
for (const file of markdown) {
  const text = readFileSync(file, 'utf8');
  const withoutCode = text.replace(/```[^\n]*\n[\s\S]*?```/g, '');
  if ((text.match(/^```/gm)?.length ?? 0) % 2) errors.push(`${relative(root, file)}: unclosed code fence`);
  for (const match of withoutCode.matchAll(/\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const href = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(href)) continue;
    const target = decodeURIComponent(href.split('#')[0].split('?')[0]);
    links++;
    if (!existsSync(resolve(dirname(file), target))) errors.push(`${relative(root, file)}: missing ${href}`);
  }
}
const directory = 'docs/architecture/diagrams';
const manifest = JSON.parse(read(`${directory}/manifest.json`));
const sources = readdirSync(resolve(root, directory)).filter((f) => f.endsWith('.puml')).sort();
if (JSON.stringify(sources) !== JSON.stringify(manifest.entries.map((e) => e.source).sort())) {
  errors.push('Diagram manifest does not list every current PlantUML source exactly once');
}
for (const entry of manifest.entries) {
  if (sha(read(`${directory}/${entry.source}`)) !== entry.sha256) errors.push(`Stale source: ${entry.source}; render again`);
  for (const format of ['svg', 'png']) {
    const name = entry.source.replace(/\.puml$/, `.${format}`);
    const path = resolve(root, directory, name);
    if (!existsSync(path) || sha(readFileSync(path)) !== entry.outputs[name]) errors.push(`Stale/missing export: ${name}`);
  }
}
// Check the complete enum contract, without depending on generated Prisma files.
const schema = read('apps/api/prisma/schema.prisma');
const contract = JSON.parse(read(`${directory}/enum-contract.json`));
for (const [name, expected] of Object.entries(contract)) {
  const body = schema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\}`))?.[1];
  const actual = body?.split('\n').map((line) => line.trim().split(/\s/)[0]).filter((v) => v && !v.startsWith('//') && !v.startsWith('@@'));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push(`Enum drift: ${name}`);
  const domain = read(`${directory}/CD-01-domain.puml`);
  for (const value of expected) if (!new RegExp(`\\b${value}\\b`).test(domain)) errors.push(`CD-01 missing ${name}.${value}`);
}
const inventory = JSON.parse(read('docs/document-register.json'));
for (const entry of inventory.artifacts) {
  for (const path of entry.paths) if (!existsSync(resolve(root, path))) errors.push(`${entry.task}: missing ${path}`);
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Docs OK: ${markdown.length} Markdown files, ${links} local links, ${sources.length} diagram source/export sets, ${Object.keys(contract).length} enums, ${inventory.artifacts.length} registered artifacts`);
