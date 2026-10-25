import type { App, Editor, PluginManifest, RequestUrlParam } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice, requestUrl } from '../../../test/obsidian';
import { pendingName, sha256Hex } from './core';
import S3Images from './main';

const BUCKET = 'https://s3.example/obsidian';

interface FakeFile {
  path: string;
  name: string;
  extension: string;
}

type Handler = (evt: unknown, editor: Editor, info: { file: FakeFile | null }) => void;

function tfile(path: string): FakeFile {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return { path, name, extension: name.slice(name.lastIndexOf('.') + 1) };
}

function uploaded(): RequestUrlParam {
  const request = requestUrl.mock.calls[0]?.[0];
  if (!request) {
    throw new Error('nothing was uploaded');
  }
  return request;
}

function setup() {
  const handlers: Record<string, Handler> = {};
  const files = new Map<string, ArrayBuffer>();
  const notes = new Map<string, string>();
  const embeds = new Map<string, { link: string; original: string }[]>();
  const createBinary = vi.fn(async (path: string, data: ArrayBuffer) => {
    files.set(path, data);
    return tfile(path);
  });
  const app = {
    workspace: {
      on: (name: string, callback: Handler) => {
        handlers[name] = callback;
        return {};
      },
      onLayoutReady: () => {},
    },
    vault: {
      getFiles: () => [...files.keys()].map(tfile),
      getMarkdownFiles: () => [...notes.keys()].map(tfile),
      readBinary: async (file: FakeFile) => files.get(file.path),
      createBinary,
      process: async (file: FakeFile, fn: (content: string) => string) => {
        const next = fn(notes.get(file.path) ?? '');
        notes.set(file.path, next);
        return next;
      },
    },
    fileManager: {
      getAvailablePathForAttachment: async (name: string) => `Attachments/${name}`,
      generateMarkdownLink: (file: FakeFile) => `[[${file.name}]]`,
      trashFile: async (file: FakeFile) => {
        files.delete(file.path);
      },
    },
    metadataCache: {
      getFileCache: (file: FakeFile) => ({ embeds: embeds.get(file.path) ?? [] }),
      getFirstLinkpathDest: (link: string) => [...files.keys()].map(tfile).find((file) => file.name === link) ?? null,
    },
  } as unknown as App;

  const plugin = new S3Images(app, {} as PluginManifest);
  return { plugin, handlers, files, notes, embeds, createBinary };
}

function editor(initial = '') {
  let value = initial;
  return {
    get value() {
      return value;
    },
    getValue: () => value,
    replaceSelection: (text: string) => {
      value += text;
    },
    offsetToPos: (offset: number) => ({ line: 0, ch: offset }),
    replaceRange: (text: string, from: { ch: number }, to: { ch: number }) => {
      value = value.slice(0, from.ch) + text + value.slice(to.ch);
    },
  };
}

function pasteOf(files: File[]) {
  return {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    clipboardData: { files },
  };
}

async function start(bucketUrl = BUCKET) {
  const context = setup();
  vi.spyOn(context.plugin, 'loadData').mockResolvedValue({ bucketUrl });
  await context.plugin.onload();
  return context;
}

const png = () => new File([new TextEncoder().encode('png bytes')], 'Screenshot.png', { type: 'image/png' });

describe('s3-images', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: () => 0 });
    requestUrl.mockReset();
    Notice.messages.length = 0;
  });

  it('uploads a pasted image and links it in place', async () => {
    requestUrl.mockResolvedValue({ status: 200 });
    const { handlers } = await start();
    const note = editor('before ');
    const evt = pasteOf([png()]);
    handlers['editor-paste']?.(evt, note as unknown as Editor, { file: tfile('Note.md') });

    const hash = await sha256Hex(await png().arrayBuffer());
    await vi.waitFor(() =>
      expect(note.value).toMatch(new RegExp(`^before !\\[\\]\\(${BUCKET}/\\d{4}-\\d{2}/${hash}\\.png\\)$`)),
    );
    expect(evt.defaultPrevented).toBe(true);
    expect(uploaded()).toMatchObject({ method: 'PUT', contentType: 'image/png' });
    expect(uploaded().url.endsWith(`/${hash}.png`)).toBe(true);
  });

  it('leaves non-image pastes and an unset bucket to Obsidian', async () => {
    const withBucket = await start();
    const text = pasteOf([new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    withBucket.handlers['editor-paste']?.(text, editor() as unknown as Editor, { file: null });
    expect(text.defaultPrevented).toBe(false);

    const withoutBucket = await start('');
    const image = pasteOf([png()]);
    withoutBucket.handlers['editor-paste']?.(image, editor() as unknown as Editor, { file: null });
    expect(image.defaultPrevented).toBe(false);
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it.each([
    ['the bucket is unreachable', () => requestUrl.mockRejectedValue(new Error('offline'))],
    ['the bucket refuses the upload', () => requestUrl.mockResolvedValue({ status: 403 })],
  ])('keeps the image in the vault when %s', async (_, fail) => {
    fail();
    const { handlers, files } = await start();
    const note = editor();
    handlers['editor-paste']?.(pasteOf([png()]), note as unknown as Editor, { file: tfile('Note.md') });

    const name = pendingName(await sha256Hex(await png().arrayBuffer()), 'png');
    await vi.waitFor(() => expect(note.value).toBe(`![[${name}]]`));
    expect(files.has(`Attachments/${name}`)).toBe(true);
    expect(Notice.messages).toHaveLength(1);
  });

  it('reuses the pending file when the same image is pasted twice offline', async () => {
    requestUrl.mockRejectedValue(new Error('offline'));
    const { handlers, createBinary } = await start();
    const note = editor();
    handlers['editor-paste']?.(pasteOf([png()]), note as unknown as Editor, { file: null });
    await vi.waitFor(() => expect(createBinary).toHaveBeenCalledOnce());
    handlers['editor-paste']?.(pasteOf([png()]), note as unknown as Editor, { file: null });
    await vi.waitFor(() => expect(note.value.match(/!\[\[/g)).toHaveLength(2));
    expect(createBinary).toHaveBeenCalledOnce();
  });

  it('uploads a pending image later, relinks every note and removes the local file', async () => {
    const { plugin, files, notes, embeds } = await start();
    const name = pendingName('abc123', 'png');
    files.set(`Attachments/${name}`, new TextEncoder().encode('png bytes').buffer);
    notes.set('A.md', `see ![[${name}]] and ![[${name}|300]]`);
    embeds.set('A.md', [
      { link: name, original: `![[${name}]]` },
      { link: name, original: `![[${name}|300]]` },
    ]);
    notes.set('B.md', 'nothing here');
    requestUrl.mockResolvedValue({ status: 200 });

    await plugin.retryPending();

    expect(uploaded().url).toMatch(/\/abc123\.png$/);
    expect(notes.get('A.md')).toMatch(
      /^see !\[\]\(https:\/\/s3\.example\/obsidian\/\d{4}-\d{2}\/abc123\.png\) and !\[\]\(/,
    );
    expect(notes.get('B.md')).toBe('nothing here');
    expect(files.has(`Attachments/${name}`)).toBe(false);
  });

  it('keeps a pending image and its links when the retry fails', async () => {
    const { plugin, files, notes, embeds } = await start();
    const name = pendingName('abc123', 'png');
    files.set(`Attachments/${name}`, new TextEncoder().encode('png bytes').buffer);
    notes.set('A.md', `see ![[${name}]]`);
    embeds.set('A.md', [{ link: name, original: `![[${name}]]` }]);
    requestUrl.mockRejectedValue(new Error('offline'));

    await plugin.retryPending();

    expect(notes.get('A.md')).toBe(`see ![[${name}]]`);
    expect(files.has(`Attachments/${name}`)).toBe(true);
  });
});
