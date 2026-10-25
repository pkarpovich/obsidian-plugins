import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { contentTypeOf, extensionOf, objectUrl, sha256Hex } from '../plugins/s3-images/src/core.ts';
import { rewriteImageRefs } from '../plugins/s3-images/src/migrate.ts';

const IMAGE = /\.(png|jpe?g|gif|webp|heic|avif|svg)$/i;
const SKIP = new Set(['.obsidian', '.trash', '.git', 'node_modules']);

const vault = process.env.OBSIDIAN_VAULT;
const bucket = process.env.S3_IMAGES_BUCKET;
const apply = process.argv.includes('--apply');
if (!vault || !bucket) {
  console.error('Set OBSIDIAN_VAULT and S3_IMAGES_BUCKET in .env');
  process.exit(1);
}

async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) {
      continue;
    }
    const path = join(dir, entry.name);
    found.push(...(entry.isDirectory() ? await walk(path) : [path]));
  }
  return found;
}

async function remote(url) {
  const response = await fetch(url, { method: 'HEAD' });
  return response.ok ? Number(response.headers.get('content-length')) : null;
}

async function upload(image) {
  if ((await remote(image.url)) === image.size) {
    return 'present';
  }
  const response = await fetch(image.url, {
    method: 'PUT',
    headers: { 'Content-Type': contentTypeOf(image.extension) },
    body: image.data,
  });
  if (!response.ok) {
    throw new Error(`PUT ${response.status}`);
  }
  if ((await remote(image.url)) !== image.size) {
    throw new Error('size mismatch after upload');
  }
  return 'uploaded';
}

const files = await walk(vault);
const notes = files.filter((path) => path.endsWith('.md'));
const byName = new Map();
for (const path of files.filter((file) => IMAGE.test(file))) {
  byName.set(basename(path), [...(byName.get(basename(path)) ?? []), path]);
}

const usedBy = new Map();
for (const note of notes) {
  const { targets } = rewriteImageRefs(await readFile(note, 'utf8'), (target) =>
    byName.has(basename(target)) ? 'probe' : undefined,
  );
  for (const name of new Set(targets.map((target) => basename(target)))) {
    usedBy.set(name, [...(usedBy.get(name) ?? []), note]);
  }
}

const ambiguous = [...usedBy.keys()].filter((name) => byName.get(name).length > 1);
if (ambiguous.length > 0) {
  console.error(`Several files share these names, resolve them first: ${ambiguous.join(', ')}`);
  process.exit(1);
}

const images = [];
for (const [name, users] of usedBy) {
  const path = byName.get(name)[0];
  const buffer = await readFile(path);
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const extension = extensionOf({ name, type: '' });
  const { mtime } = await stat(path);
  const url = objectUrl(bucket, mtime, await sha256Hex(data), extension);
  images.push({ name, path, data, size: buffer.byteLength, extension, url, users });
}

const unused = [...byName.keys()].filter((name) => !usedBy.has(name));
const megabytes = (bytes) => (bytes / 1048576).toFixed(1);
for (const image of images) {
  console.log(`${relative(vault, image.path)}\t${megabytes(image.size)} MB\t${image.users.length} note(s)\t${image.url}`);
}
console.log(
  `\n${images.length} images, ${megabytes(images.reduce((sum, image) => sum + image.size, 0))} MB, used by ${new Set(images.flatMap((image) => image.users)).size} notes`,
);
console.log(`${unused.length} images no note uses, left in place: ${unused.join(', ')}`);
if (!apply) {
  console.log('\nDry run. Pass --apply to upload, relink and move the local files to the vault trash.');
  process.exit(0);
}

const urls = new Map();
for (const image of images) {
  try {
    console.log(`${await upload(image)}\t${image.name}`);
    urls.set(image.name, image.url);
  } catch (error) {
    console.error(`failed\t${image.name}\t${error.message}`);
  }
}

for (const note of new Set(images.flatMap((image) => image.users))) {
  const before = await readFile(note, 'utf8');
  const { content } = rewriteImageRefs(before, (target) => urls.get(basename(target)));
  if (content !== before) {
    await writeFile(note, content);
  }
}

const remaining = new Map();
for (const note of notes) {
  const { targets } = rewriteImageRefs(await readFile(note, 'utf8'), (target) =>
    urls.has(basename(target)) ? 'probe' : undefined,
  );
  for (const target of targets) {
    remaining.set(basename(target), note);
  }
}

const trash = join(vault, '.trash');
await mkdir(trash, { recursive: true });
for (const image of images.filter((candidate) => urls.has(candidate.name))) {
  if (remaining.has(image.name)) {
    console.error(`kept\t${image.name}\tstill referenced by ${relative(vault, remaining.get(image.name))}`);
    continue;
  }
  await rename(image.path, join(trash, image.name));
}
console.log(`\nDone: ${urls.size} of ${images.length} images moved to S3.`);
