import { cp, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const vault = process.env.OBSIDIAN_VAULT;
if (!vault) {
  console.error('OBSIDIAN_VAULT is not set: put OBSIDIAN_VAULT=/path/to/vault in .env');
  process.exit(1);
}
await stat(join(vault, '.obsidian')).catch(() => {
  console.error(`${vault} has no .obsidian folder`);
  process.exit(1);
});

for (const name of await readdir('dist')) {
  const target = join(vault, '.obsidian', 'plugins', name);
  await cp(join('dist', name), target, { recursive: true });
  console.log(`${name} -> ${target}`);
}
