import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const read = (path) => readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const exists = (path) => existsSync(resolve(root, path));
const walk = (dir) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)]);
};

// A2 delivery packages are optional in this checkout. Only scan folders that
// are actually present, so removing a package cannot crash the quality gate.
const ownerFolders = ['Khang-A2', 'Huy-A2', 'Hoang-A2', 'Kiet-A2', 'Khai-A2'];
const documentationRoots = ['docs', ...ownerFolders].filter(exists);
const markdown = [
  ...['README.md', 'apps/api/README.md', 'apps/web/README.md'].filter(exists).map((path) => resolve(root, path)),
  ...documentationRoots.flatMap((directory) => walk(resolve(root, directory)).filter((file) => file.endsWith('.md'))),
];

let links = 0;
const optionalLegacyLink = (href) =>
  /(?:^|\/)(?:Khang-A2|Huy-A2|Hoang-A2|Kiet-A2|Khai-A2)(?:\/|$)/.test(href) ||
  /(?:^|\/)orders\.openapi\.yaml$/.test(href);
for (const file of [...new Set(markdown)]) {
  const text = readFileSync(file, 'utf8');
  const withoutCode = text.replace(/```[^\n]*\n[\s\S]*?```/g, '');
  if ((text.match(/^```/gm)?.length ?? 0) % 2) errors.push(`${relative(root, file)}: unclosed code fence`);
  for (const match of withoutCode.matchAll(/\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const href = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(href)) continue;
    const target = decodeURIComponent(href.split('#')[0].split('?')[0]);
    links++;
    if (target && !existsSync(resolve(dirname(file), target)) && !optionalLegacyLink(target)) {
      errors.push(`${relative(root, file)}: missing ${href}`);
    }
  }
}

let sourceCount = 0;
let enumCount = 0;
const manifestPath = ownerFolders
  .map((owner) => `${owner}/docs/architecture/diagrams/manifest.json`)
  .concat('docs/architecture/diagrams/manifest.json')
  .find(exists);

if (manifestPath) {
  const manifest = JSON.parse(read(manifestPath));
  const manifestDirectory = dirname(manifestPath).replaceAll('\\', '/');
  const repositoryRelative = manifest.pathBase === 'repository';
  if (manifest.version === 2 && !repositoryRelative) errors.push('Diagram manifest v2 must use repository-relative paths');

  const sources = documentationRoots.flatMap((directory) =>
    walk(resolve(root, directory, 'architecture/diagrams'))
      .filter((file) => file.endsWith('.puml'))
      .map((file) => relative(root, file).replaceAll('\\', '/'))).sort();
  sourceCount = sources.length;
  const manifestSources = manifest.entries.map((entry) => {
    if (repositoryRelative) return entry.source;
    return `${manifestDirectory}/${entry.source}`;
  }).sort();
  if (JSON.stringify(sources) !== JSON.stringify(manifestSources)) {
    errors.push('Diagram manifest does not list every current PlantUML source exactly once');
  }

  for (const entry of manifest.entries) {
    const sourcePath = repositoryRelative ? entry.source : `${manifestDirectory}/${entry.source}`;
    if (!exists(sourcePath)) {
      errors.push(`Missing diagram source: ${sourcePath}`);
      continue;
    }
    if (sha(read(sourcePath)) !== entry.sha256) errors.push(`Stale source: ${sourcePath}; render again`);
    for (const format of ['svg', 'png']) {
      const outputName = entry.source.replace(/\.puml$/, `.${format}`);
      const outputPath = repositoryRelative ? outputName : `${manifestDirectory}/${outputName}`;
      const expectedHash = entry.outputs[outputName] ?? entry.outputs[basename(outputName)];
      if (!exists(outputPath) || sha(readFileSync(resolve(root, outputPath))) !== expectedHash) {
        errors.push(`Stale/missing export: ${outputPath}`);
      }
    }
  }

  const contractPath = [`${manifestDirectory}/enum-contract.json`, 'docs/architecture/diagrams/enum-contract.json'].find(exists);
  const domainPath = manifest.entries
    .map((entry) => (repositoryRelative ? entry.source : `${manifestDirectory}/${entry.source}`))
    .find((path) => path.endsWith('/CD-01-domain.puml') || path === 'CD-01-domain.puml');
  if (contractPath && domainPath && exists('apps/api/prisma/schema.prisma')) {
    const schema = read('apps/api/prisma/schema.prisma');
    const contract = JSON.parse(read(contractPath));
    const domain = read(domainPath);
    enumCount = Object.keys(contract).length;
    for (const [name, expected] of Object.entries(contract)) {
      const body = schema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\}`))?.[1];
      const actual = body?.split('\n').map((line) => line.trim().split(/\s/)[0])
        .filter((value) => value && !value.startsWith('//') && !value.startsWith('@@'));
      if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push(`Enum drift: ${name}`);
      for (const value of expected) if (!new RegExp(`\\b${value}\\b`).test(domain)) errors.push(`CD-01 missing ${name}.${value}`);
    }
  }
} else if (walk(resolve(root, 'docs')).some((file) => file.endsWith('.puml'))) {
  errors.push('Diagram sources exist but no manifest.json was found');
}

let inventoryCount = 0;
const inventoryPath = ownerFolders
  .map((owner) => `${owner}/docs/document-register.json`)
  .concat('docs/document-register.json')
  .find(exists);
if (inventoryPath) {
  const inventory = JSON.parse(read(inventoryPath));
  inventoryCount = inventory.artifacts.length;
  for (const entry of inventory.artifacts) {
    for (const path of entry.paths) {
      if (!exists(path)) errors.push(`${entry.task}: missing ${path}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  const skipped = [
    manifestPath ? null : 'diagram manifest/exports',
    inventoryPath ? null : 'document register',
  ].filter(Boolean);
  const suffix = skipped.length ? ` (skipped: ${skipped.join(', ')})` : '';
  console.log(`Docs OK: ${markdown.length} Markdown files, ${links} local links, ${sourceCount} diagram source/export sets, ${enumCount} enums, ${inventoryCount} registered artifacts${suffix}`);
}
