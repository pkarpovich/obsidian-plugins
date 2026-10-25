# obsidian-plugins

Small Obsidian plugins for my own vault, one folder each under `plugins/`.

| Plugin             | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collapse-and-top` | Command that collapses every folder in the file explorer and scrolls it back to the top.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `s3-images`        | Uploads pasted and dropped images and PDFs to an S3 bucket and links them from the note: an image as `![](url)`, a PDF as `[name.pdf](url)` served inline under its own file name, since Obsidian cannot embed a remote PDF. When the upload fails the image is saved in the vault as `s3-pending-<sha256>.<ext>` (`s3-pending-<sha256>--<name>.pdf` for a PDF) and uploaded on the next retry (app start, network back online, every 5 minutes), which relinks every note embedding it and moves the local file to trash. The bucket must exist; objects are written with an unsigned `PUT`, so the bucket has to accept anonymous writes. |

## Development

Node and pnpm are pinned in `mise.toml`.

```sh
mise install
pnpm install
pnpm build    # every plugin into dist/<id>/
pnpm check    # tsc
pnpm lint
pnpm test     # vitest, with `obsidian` aliased to test/obsidian.ts
pnpm vault    # build, then copy dist/<id>/ into $OBSIDIAN_VAULT/.obsidian/plugins/<id>/
```

`OBSIDIAN_VAULT` comes from `.env` (gitignored), which mise loads. Obsidian Sync carries the installed plugins to other devices when "Installed community plugins" and "Active community plugin list" are on in its settings on each device.

Each plugin is linted from its own folder (`scripts/lint.mjs`) because `eslint-plugin-obsidianmd` reads `manifest.json` from the working directory. ESLint stays on 9 because that plugin's dependencies support nothing newer, and TypeScript stays on 6 because `typescript-eslint` requires `<6.1`.

## Adding a plugin

Create `plugins/<id>/manifest.json` and `plugins/<id>/src/main.ts`; the build, lint and vault scripts pick the folder up.
