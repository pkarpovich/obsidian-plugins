import { describe, expect, it } from 'vitest';
import { rewriteImageRefs } from './migrate';

const urls: Record<string, string> = {
  'shot.png': 'https://s3.example/obsidian/2026-10/aaa.png',
  'cover.jpg': 'https://s3.example/obsidian/2026-09/bbb.jpg',
};
const urlFor = (target: string) => urls[target.slice(target.lastIndexOf('/') + 1)];

describe('rewriteImageRefs', () => {
  it('turns a wikilink embed into a markdown image and keeps its width', () => {
    const { content, targets } = rewriteImageRefs('a ![[shot.png]] b ![[Attachments/shot.png|300]] c', urlFor);
    expect(content).toBe(
      'a ![](https://s3.example/obsidian/2026-10/aaa.png) b ![|300](https://s3.example/obsidian/2026-10/aaa.png) c',
    );
    expect(targets).toEqual(['shot.png', 'Attachments/shot.png']);
  });

  it('keeps alt text that is not a size', () => {
    expect(rewriteImageRefs('![[shot.png|the dialog]]', urlFor).content).toBe(
      '![the dialog](https://s3.example/obsidian/2026-10/aaa.png)',
    );
  });

  it('repoints a markdown image embed, including an encoded path', () => {
    expect(rewriteImageRefs('![alt](Attachments/shot.png) ![x](Attachments/cover%2Ejpg)', urlFor).content).toBe(
      '![alt](https://s3.example/obsidian/2026-10/aaa.png) ![x](https://s3.example/obsidian/2026-09/bbb.jpg)',
    );
  });

  it('turns an image link in a frontmatter property into a quoted url', () => {
    const note = '---\ncover: [[cover.jpg]]\nposter: "[[Attachments/shot.png]]"\ntags: [a]\n---\nbody [[cover.jpg]]';
    const { content, targets } = rewriteImageRefs(note, urlFor);
    expect(content).toBe(
      '---\ncover: "https://s3.example/obsidian/2026-09/bbb.jpg"\nposter: "https://s3.example/obsidian/2026-10/aaa.png"\ntags: [a]\n---\nbody [[cover.jpg]]',
    );
    expect(targets).toEqual(['cover.jpg', 'Attachments/shot.png']);
  });

  it('turns a bare image file name in a property into a quoted url', () => {
    const note = '---\ncover: cover.jpg\nbanner: "Attachments/shot.png"\ntitle: shot.png notes\n---\nbody';
    const { content, targets } = rewriteImageRefs(note, urlFor);
    expect(content).toBe(
      '---\ncover: "https://s3.example/obsidian/2026-09/bbb.jpg"\nbanner: "https://s3.example/obsidian/2026-10/aaa.png"\ntitle: shot.png notes\n---\nbody',
    );
    expect(targets).toEqual(['cover.jpg', 'Attachments/shot.png']);
  });

  it('leaves links to notes, unknown images and remote images alone', () => {
    const note = '![[Some note]] ![[other.png]] ![](https://example.com/x.png) [[shot.png]]';
    expect(rewriteImageRefs(note, urlFor)).toEqual({ content: note, targets: [] });
  });
});
