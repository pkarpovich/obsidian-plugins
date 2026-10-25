import { builtinModules } from 'node:module';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const plugins = (await readdir('plugins', { withFileTypes: true })).filter((entry) => entry.isDirectory());

const external = [
  'obsidian',
  'electron',
  '@codemirror/autocomplete',
  '@codemirror/collab',
  '@codemirror/commands',
  '@codemirror/language',
  '@codemirror/lint',
  '@codemirror/search',
  '@codemirror/state',
  '@codemirror/view',
  '@lezer/common',
  '@lezer/highlight',
  '@lezer/lr',
  ...builtinModules,
];

for (const { name } of plugins) {
  const out = `dist/${name}`;
  await mkdir(out, { recursive: true });
  await copyFile(`plugins/${name}/manifest.json`, `${out}/manifest.json`);
  const context = await esbuild.context({
    entryPoints: [`plugins/${name}/src/main.ts`],
    bundle: true,
    external,
    format: 'cjs',
    target: ['es2025', 'safari26'],
    logLevel: 'info',
    sourcemap: watch ? 'inline' : false,
    treeShaking: true,
    minify: !watch,
    outfile: `${out}/main.js`,
  });
  if (watch) {
    await context.watch();
    continue;
  }
  await context.rebuild();
  await context.dispose();
}
