import {
  Notice,
  Plugin,
  PluginSettingTab,
  requestUrl,
  type App,
  type Editor,
  type MarkdownFileInfo,
  type MarkdownView,
  type SettingDefinitionItem,
  type TFile,
} from 'obsidian';
import {
  contentTypeOf,
  extensionOf,
  hashOfPending,
  objectUrl,
  pendingName,
  placeholder,
  replaceAll,
  sha256Hex,
} from './core';

interface Settings {
  bucketUrl: string;
}

const DEFAULTS: Settings = { bucketUrl: '' };
const RETRY_INTERVAL_MS = 5 * 60 * 1000;

export default class S3Images extends Plugin {
  settings: Settings = { ...DEFAULTS };
  private retrying = false;

  override async onload(): Promise<void> {
    this.settings = { ...DEFAULTS, ...((await this.loadData()) as Partial<Settings> | null) };
    this.addSettingTab(new S3ImagesSettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on('editor-paste', (evt, editor, info) =>
        this.onFiles(evt, evt.clipboardData?.files, editor, info),
      ),
    );
    this.registerEvent(
      this.app.workspace.on('editor-drop', (evt, editor, info) =>
        this.onFiles(evt, evt.dataTransfer?.files, editor, info),
      ),
    );
    this.registerDomEvent(window, 'online', () => void this.retryPending());
    this.registerInterval(window.setInterval(() => void this.retryPending(), RETRY_INTERVAL_MS));
    this.app.workspace.onLayoutReady(() => void this.retryPending());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async retryPending(): Promise<void> {
    if (this.retrying || !this.settings.bucketUrl) {
      return;
    }
    this.retrying = true;
    try {
      for (const file of this.app.vault.getFiles()) {
        const hash = hashOfPending(file.name);
        if (!hash) {
          continue;
        }
        try {
          const url = objectUrl(this.settings.bucketUrl, new Date(), hash, file.extension);
          await this.upload(url, await this.app.vault.readBinary(file), contentTypeOf(file.extension));
          await this.relink(file, url);
          await this.app.fileManager.trashFile(file);
        } catch {
          continue;
        }
      }
    } finally {
      this.retrying = false;
    }
  }

  private onFiles(
    evt: Event,
    files: FileList | null | undefined,
    editor: Editor,
    info: MarkdownView | MarkdownFileInfo,
  ): void {
    if (evt.defaultPrevented || !this.settings.bucketUrl || !files) {
      return;
    }
    const images = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) {
      return;
    }
    evt.preventDefault();
    for (const image of images) {
      void this.insert(image, editor, info.file);
    }
  }

  private async insert(image: File, editor: Editor, note: TFile | null): Promise<void> {
    const marker = placeholder(crypto.randomUUID().slice(0, 8));
    editor.replaceSelection(marker);

    const data = await image.arrayBuffer();
    const hash = await sha256Hex(data);
    const extension = extensionOf(image);
    let embed: string;
    try {
      const url = objectUrl(this.settings.bucketUrl, new Date(), hash, extension);
      await this.upload(url, data, contentTypeOf(extension));
      embed = `![](${url})`;
    } catch {
      embed = await this.savePending(data, hash, extension, note);
      new Notice('Image saved in the vault, it will be uploaded when the bucket is reachable');
    }
    await this.replaceMarker(editor, note, marker, embed);
  }

  private async upload(url: string, body: ArrayBuffer, contentType: string): Promise<void> {
    const response = await requestUrl({ url, method: 'PUT', body, contentType, throw: false });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`upload failed with status ${response.status}`);
    }
  }

  private async savePending(data: ArrayBuffer, hash: string, extension: string, note: TFile | null): Promise<string> {
    const name = pendingName(hash, extension);
    const sourcePath = note?.path ?? '';
    const existing = this.app.vault.getFiles().find((file) => file.name === name);
    const file =
      existing ??
      (await this.app.vault.createBinary(
        await this.app.fileManager.getAvailablePathForAttachment(name, sourcePath),
        data,
      ));
    return `!${this.app.fileManager.generateMarkdownLink(file, sourcePath)}`;
  }

  private async replaceMarker(editor: Editor, note: TFile | null, marker: string, embed: string): Promise<void> {
    const offset = editor.getValue().indexOf(marker);
    if (offset >= 0) {
      editor.replaceRange(embed, editor.offsetToPos(offset), editor.offsetToPos(offset + marker.length));
      return;
    }
    if (note) {
      await this.app.vault.process(note, (content) => content.replace(marker, embed));
    }
  }

  private async relink(target: TFile, url: string): Promise<void> {
    const { metadataCache, vault } = this.app;
    for (const note of vault.getMarkdownFiles()) {
      const originals = (metadataCache.getFileCache(note)?.embeds ?? [])
        .filter((embed) => metadataCache.getFirstLinkpathDest(embed.link, note.path)?.path === target.path)
        .map((embed) => embed.original);
      if (originals.length > 0) {
        await vault.process(note, (content) => replaceAll(content, originals, `![](${url})`));
      }
    }
  }
}

class S3ImagesSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly owner: S3Images,
  ) {
    super(app, owner);
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: 'Bucket URL',
        desc: 'Images are uploaded under this address and linked from the note. Leave empty to keep the default paste behaviour.',
        control: {
          type: 'text',
          key: 'bucketUrl',
          placeholder: 'https://s3.example.com/obsidian',
          validate: (value: string) =>
            value === '' || /^https?:\/\/\S+$/.test(value) ? undefined : 'Use an http:// or https:// address',
        },
      },
    ];
  }

  override getControlValue(key: string): unknown {
    return key === 'bucketUrl' ? this.owner.settings.bucketUrl : undefined;
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === 'bucketUrl' && typeof value === 'string') {
      this.owner.settings.bucketUrl = value.trim();
      await this.owner.saveSettings();
    }
  }
}
