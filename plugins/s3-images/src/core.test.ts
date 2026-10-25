import { describe, expect, it } from 'vitest';
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

describe('core', () => {
  it('names the extension by mime type, then by file name', () => {
    expect(extensionOf({ name: 'Screen Shot.PNG', type: 'image/png' })).toBe('png');
    expect(extensionOf({ name: 'photo.jpeg', type: 'image/jpeg' })).toBe('jpg');
    expect(extensionOf({ name: 'scan.TIFF', type: '' })).toBe('tiff');
    expect(extensionOf({ name: 'Cover.JPEG', type: '' })).toBe('jpg');
    expect(extensionOf({ name: 'blob', type: '' })).toBe('bin');
  });

  it('maps an extension back to its content type', () => {
    expect(contentTypeOf('png')).toBe('image/png');
    expect(contentTypeOf('jpg')).toBe('image/jpeg');
    expect(contentTypeOf('tiff')).toBe('application/octet-stream');
  });

  it('hashes content so the same image gets the same key', async () => {
    const data = new TextEncoder().encode('probe').buffer;
    expect(await sha256Hex(data)).toBe('ba9c736f19e7f60b7f6764adb0b7908c0a2b394e09b6c09863528c7f2bc86095');
    expect(await sha256Hex(new TextEncoder().encode('other').buffer)).not.toBe(await sha256Hex(data));
  });

  it('builds the object url under a month folder', () => {
    const date = new Date(Date.UTC(2026, 9, 25));
    expect(objectUrl('https://s3.example/obsidian/', date, 'abc', 'png')).toBe(
      'https://s3.example/obsidian/2026-10/abc.png',
    );
    expect(objectUrl('https://s3.example/obsidian', date, 'abc', 'png')).toBe(
      'https://s3.example/obsidian/2026-10/abc.png',
    );
  });

  it('round-trips the hash through a pending file name', () => {
    expect(hashOfPending(pendingName('abc123', 'png'))).toBe('abc123');
    expect(hashOfPending('photo.png')).toBeNull();
  });

  it('replaces every occurrence of every original', () => {
    const note = `${placeholder('1')}\ntext ![[a.png]] and ![[a.png|300]] and ![[a.png]]`;
    expect(replaceAll(note, ['![[a.png]]', '![[a.png|300]]'], '![](u)')).toBe(
      `${placeholder('1')}\ntext ![](u) and ![](u) and ![](u)`,
    );
  });
});
