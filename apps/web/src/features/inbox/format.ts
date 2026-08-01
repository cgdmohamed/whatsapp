export function contactDisplayName(contact: { firstName: string | null; lastName: string | null; displayName: string | null; phoneE164: string }): string {
  if (contact.displayName) {
    return contact.displayName;
  }
  const full = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  return full.length > 0 ? full : contact.phoneE164;
}

export function messagePreview(message: {
  textContent: string | null;
  templateName: string | null;
  type: string;
  mediaFile: { contentType: string | null } | null;
  direction: string;
}): string {
  if (message.mediaFile) {
    return message.mediaFile.contentType?.startsWith('image/') ? 'Image' : 'File';
  }
  if (message.textContent) {
    return message.textContent;
  }
  if (message.templateName) {
    return `Template: ${message.templateName}`;
  }
  return message.type;
}
