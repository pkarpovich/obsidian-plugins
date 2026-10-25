export const PENDING_PREFIX = 's3-pending-';

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
};

const UNSAFE_IN_NAME = /[\\/:*?"<>|#^[\]]/g;
const PENDING = /^s3-pending-([0-9a-f]{64})(?:--(.+))?\.[^.]+$/;

export function isSupported(type: string): boolean {
  return type.startsWith('image/') || type === 'application/pdf';
}

export function isDocument(extension: string): boolean {
  return extension === 'pdf';
}

export function extensionOf(file: { name: string; type: string }): string {
  const known = EXTENSIONS[file.type];
  if (known) {
    return known;
  }
  const dot = file.name.lastIndexOf('.');
  const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : 'bin';
  return extension === 'jpeg' ? 'jpg' : extension;
}

export function contentTypeOf(extension: string): string {
  const match = Object.entries(EXTENSIONS).find(([, ext]) => ext === extension);
  return match ? match[0] : 'application/octet-stream';
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function objectUrl(bucketUrl: string, date: Date, hash: string, extension: string): string {
  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${bucketUrl.replace(/\/+$/, '')}/${month}/${hash}.${extension}`;
}

export function pendingName(hash: string, extension: string, title?: string): string {
  const suffix = title ? `--${title.replace(UNSAFE_IN_NAME, '-')}` : '';
  return `${PENDING_PREFIX}${hash}${suffix}.${extension}`;
}

export function parsePending(name: string): { hash: string; title?: string } | null {
  const match = PENDING.exec(name);
  if (!match?.[1]) {
    return null;
  }
  return match[2] ? { hash: match[1], title: match[2] } : { hash: match[1] };
}

export function contentDisposition(fileName: string): string {
  return `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function linkText(text: string): string {
  return text.replace(/[[\]]/g, (bracket) => `\\${bracket}`);
}

export function placeholder(id: string): string {
  return `![Uploading ${id}…]()`;
}

export function replaceAll(content: string, originals: string[], replacement: string): string {
  return originals.reduce((text, original) => text.split(original).join(replacement), content);
}
