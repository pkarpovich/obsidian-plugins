export interface Rewrite {
  content: string;
  targets: string[];
}

const SIZE = /^\d+(x\d+)?$/;
const FRONTMATTER = /^---\n[\s\S]*?\n---(?=\n|$)/;
const PROPERTY_LINK = /^([\w-]+):[ \t]*"?\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]"?[ \t]*$/gm;
const WIKI_EMBED = /!\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]/g;
const MARKDOWN_EMBED = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

function decoded(target: string): string {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

export function rewriteImageRefs(content: string, urlFor: (target: string) => string | undefined): Rewrite {
  const targets: string[] = [];
  const resolve = (target: string): string | undefined => {
    const url = urlFor(target);
    if (url) {
      targets.push(target);
    }
    return url;
  };

  const frontmatter = FRONTMATTER.exec(content)?.[0] ?? '';
  const properties = frontmatter.replace(PROPERTY_LINK, (line, key: string, target: string) => {
    const url = resolve(target.trim());
    return url ? `${key}: "${url}"` : line;
  });

  const body = content
    .slice(frontmatter.length)
    .replace(WIKI_EMBED, (embed, target: string, label: string | undefined) => {
      const url = resolve(target.trim());
      if (!url) {
        return embed;
      }
      const alt = label === undefined ? '' : SIZE.test(label.trim()) ? `|${label.trim()}` : label;
      return `![${alt}](${url})`;
    })
    .replace(MARKDOWN_EMBED, (embed, alt: string, target: string) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
        return embed;
      }
      const url = resolve(decoded(target));
      return url ? `![${alt}](${url})` : embed;
    });

  return { content: properties + body, targets };
}
