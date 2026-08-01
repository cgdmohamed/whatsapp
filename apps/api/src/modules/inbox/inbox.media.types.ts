import { createHash } from 'node:crypto';

export const ALLOWED_MEDIA_TYPES = new Map<string, string[]>([
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/png', ['png']],
  ['image/gif', ['gif']],
  ['image/webp', ['webp']],
  ['video/mp4', ['mp4']],
  ['audio/ogg', ['ogg', 'oga']],
  ['audio/mpeg', ['mp3']],
  ['audio/mp4', ['m4a', 'mp4']],
  ['application/pdf', ['pdf']],
  ['application/msword', ['doc']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['docx']],
  ['application/vnd.ms-excel', ['xls']],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['xlsx']],
  ['application/vnd.ms-powerpoint', ['ppt']],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', ['pptx']],
  ['text/plain', ['txt', 'text']],
  ['text/csv', ['csv']],
]);

export function extensionForMime(mimeType: string): string {
  const ext = ALLOWED_MEDIA_TYPES.get(mimeType)?.[0];
  return ext ?? 'bin';
}

export function isSupportedMime(mimeType: string): boolean {
  return ALLOWED_MEDIA_TYPES.has(mimeType);
}

// Minimal magic-byte detection for the types WhatsApp sends. Returns a mime type
// derived from the leading bytes, or null when unknown.
export function detectMimeFromBuffer(buffer: Buffer): string | null {
  const head = buffer.subarray(0, 16);
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) {
    return 'image/png';
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return 'image/jpeg';
  }
  if (head.length >= 6 && (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38)) {
    return 'image/gif';
  }
  if (head.length >= 12 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (head.length >= 12 && head.toString('ascii', 4, 8) === 'ftyp' && head.toString('ascii', 0, 4) !== 'M4A ') {
    const brand = head.toString('ascii', 8, 12);
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1'].includes(brand)) {
      return 'video/mp4';
    }
    if (['M4A ', 'M4B ', 'M4P '].includes(brand)) {
      return 'audio/mp4';
    }
  }
  if (head.length >= 4 && head.toString('ascii', 0, 4) === 'OggS') {
    return 'audio/ogg';
  }
  if (head.length >= 2 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
    return 'audio/mpeg';
  }
  if (head.length >= 5 && head.toString('ascii', 0, 5) === '%PDF-') {
    return 'application/pdf';
  }
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    // ZIP container: docx/xlsx/pptx/etc.
    return 'application/zip';
  }
  return null;
}

export function fileMatchesDeclaredMime(declaredMime: string, buffer: Buffer): boolean {
  const detected = detectMimeFromBuffer(buffer);
  if (!detected) {
    // Undetectable magic bytes — fall back to the declared mime being supported.
    return isSupportedMime(declaredMime);
  }
  if (detected === 'application/zip') {
    return (
      declaredMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      declaredMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      declaredMime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
  }
  return detected === declaredMime;
}

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
