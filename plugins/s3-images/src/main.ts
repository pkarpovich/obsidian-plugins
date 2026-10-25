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
  contentDisposition,
  contentTypeOf,
  extensionOf,
  isDocument,
  isSupported,
  linkText,
  objectUrl,
  parsePending,
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
        const pending = parsePending(file.name);
        if (!pending) {
          continue;
        }
        try {
          const url = objectUrl(this.settings.bucketUrl, new Date(), pending.hash, file.extension);
          const fileName = pending.title ? `${pending.title}.${file.extension}` : undefined;
          await this.upload(url, await this.app.vault.readBinary(file), contentTypeOf(file.extension), fileName);
          await this.relink(file, url, fileName ?? file.name);
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
    const uploads = Array.from(files).filter((file) => isSupported(file.type));
    if (uploads.length === 0) {
      return;
    }
    evt.preventDefault();
    for (const file of uploads) {
      void this.insert(file, editor, info.file);
    }
  }

  private async insert(file: File, editor: Editor, note: TFile | null): Promise<void> {
    const marker = placeholder(crypto.randomUUID().slice(0, 8));
    editor.replaceSelection(marker);

    const data = await file.arrayBuffer();
    const hash = await sha256Hex(data);
    const extension = extensionOf(file);
    const fileName = isDocument(extension) ? file.name : undefined;
    let reference: string;
    try {
      const url = objectUrl(this.settings.bucketUrl, new Date(), hash, extension);
      await this.upload(url, data, contentTypeOf(extension), fileName);
      reference = fileName ? `[${linkText(fileName)}](${url})` : `![](${url})`;
    } catch {
      reference = await this.savePending(data, hash, extension, note, fileName);
      new Notice(`${fileName ?? 'Image'} saved in the vault, it will be uploaded when the bucket is reachable`);
    }
    await this.replaceMarker(editor, note, marker, reference);
  }

  private async upload(url: string, body: ArrayBuffer, contentType: string, fileName?: string): Promise<void> {
    const headers = fileName ? { 'Content-Disposition': contentDisposition(fileName) } : undefined;
    const response = await requestUrl({ url, method: 'PUT', body, contentType, headers, throw: false });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`upload failed with status ${response.status}`);
    }
  }

  private async savePending(
    data: ArrayBuffer,
    hash: string,
    extension: string,
    note: TFile | null,
    fileName?: string,
  ): Promise<string> {
    const name = pendingName(hash, extension, fileName?.replace(/\.[^.]+$/, ''));
    const sourcePath = note?.path ?? '';
    const existing = this.app.vault.getFiles().find((file) => file.name === name);
    const file =
      existing ??
      (await this.app.vault.createBinary(
        await this.app.fileManager.getAvailablePathForAttachment(name, sourcePath),
        data,
      ));
    return fileName
      ? this.app.fileManager.generateMarkdownLink(file, sourcePath, undefined, fileName)
      : `!${this.app.fileManager.generateMarkdownLink(file, sourcePath)}`;
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

  private async relink(target: TFile, url: string, displayName: string): Promise<void> {
    const { metadataCache, vault } = this.app;
    const asLink = `[${linkText(displayName)}](${url})`;
    const asEmbed = isDocument(target.extension) ? asLink : `![](${url})`;
    for (const note of vault.getMarkdownFiles()) {
      const cache = metadataCache.getFileCache(note);
      const pointing = (refs: { link: string; original: string }[] | undefined): string[] =>
        (refs ?? [])
          .filter((ref) => metadataCache.getFirstLinkpathDest(ref.link, note.path)?.path === target.path)
          .map((ref) => ref.original);
      const embeds = pointing(cache?.embeds);
      const links = pointing(cache?.links);
      if (embeds.length + links.length > 0) {
        await vault.process(note, (content) => replaceAll(replaceAll(content, embeds, asEmbed), links, asLink));
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
