import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';

const eslint = (args, cwd) => spawnSync('eslint', ['--max-warnings', '0', ...args], { cwd, stdio: 'inherit' }).status;

const plugins = (await readdir('plugins', { withFileTypes: true })).filter((entry) => entry.isDirectory());
const failed = [
  eslint(['.'], '.'),
  ...plugins.map(({ name }) => eslint(['--config', '../../eslint.plugin.config.mjs', 'src'], `plugins/${name}`)),
];
process.exit(failed.some((status) => status !== 0) ? 1 : 0);
