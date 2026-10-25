# obsidian-plugins

Small Obsidian plugins for my own vault, one folder each under `plugins/`.

| Plugin             | What it does                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `collapse-and-top` | Command that collapses every folder in the file explorer and scrolls it back to the top. |

## Development

Node and pnpm are pinned in `mise.toml`.

```sh
mise install
pnpm install
pnpm build    # every plugin into dist/<id>/
pnpm check    # tsc
pnpm lint
pnpm vault    # build, then copy dist/<id>/ into $OBSIDIAN_VAULT/.obsidian/plugins/<id>/
```

`OBSIDIAN_VAULT` comes from `.env` (gitignored), which mise loads. Obsidian Sync carries the installed plugins to other devices when "Installed community plugins" and "Active community plugin list" are on in its settings on each device.

Each plugin is linted from its own folder (`scripts/lint.mjs`) because `eslint-plugin-obsidianmd` reads `manifest.json` from the working directory. ESLint stays on 9 because that plugin's dependencies support nothing newer, and TypeScript stays on 6 because `typescript-eslint` requires `<6.1`.

## Adding a plugin

Create `plugins/<id>/manifest.json` and `plugins/<id>/src/main.ts`; the build, lint and vault scripts pick the folder up.
