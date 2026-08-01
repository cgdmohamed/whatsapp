import DOMPurify from 'dompurify';

const ALLOWED = [
  'p', 'br', 'hr', 'h2', 'h3', 'h4', 'h5',
  'strong', 'em', 'b', 'i', 'u', 's',
  'a', 'code', 'pre', 'ol', 'ul', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'div', 'span', 'img',
];

const ALLOWED_ATTR: Record<string, readonly string[]> = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  div: ['class'],
  span: ['class'],
  code: ['class'],
  pre: ['class'],
  th: ['colspan', 'rowspan', 'align'],
  td: ['colspan', 'rowspan', 'align'],
};

export function sanitizeHtml(html: string): string {
  const config = {
    ALLOWED_TAGS: ALLOWED,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  } as unknown as Parameters<typeof DOMPurify.sanitize>[1];
  return DOMPurify.sanitize(html, config) as string;
}

export function HelpRichText({ html, className }: { html: string; className?: string }) {
  const safe = sanitizeHtml(html);
  return <div className={className ? `help-body ${className}` : 'help-body'} dangerouslySetInnerHTML={{ __html: safe }} />;
}
