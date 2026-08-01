import xss from 'xss';

const ALLOWED_CLASSES = new Set(['note', 'warning', 'tip', 'important', 'permission', 'mistake', 'success', 'callout', 'step']);

const whiteList: Record<string, string[]> = {
  p: [],
  br: [],
  hr: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  strong: [],
  em: [],
  b: [],
  i: [],
  u: [],
  s: [],
  a: ['href', 'title', 'target', 'rel'],
  code: ['class'],
  pre: ['class'],
  ol: ['start', 'type'],
  ul: [],
  li: [],
  table: [],
  thead: [],
  tbody: [],
  tr: [],
  th: ['colspan', 'rowspan', 'align'],
  td: ['colspan', 'rowspan', 'align'],
  blockquote: [],
  div: ['class'],
  span: ['class'],
  img: ['src', 'alt', 'title', 'width', 'height'],
};

export function sanitizeHelpHtml(input: string | null | undefined): string {
  if (!input) {
    return '';
  }
  return xss(input, {
    whiteList,
    stripIgnoreTag: true,
    allowCommentTag: false,
    onTagAttr(_tag: string, name: string, value: string): string | undefined {
      if (name === 'class') {
        const allowed = value
          .split(/\s+/)
          .filter((item) => ALLOWED_CLASSES.has(item));
        return allowed.length > 0 ? ` class="${allowed.join(' ')}"` : '';
      }
      if (name === 'href' && /^\s*javascript:/i.test(value)) {
        return '';
      }
      return undefined;
    },
  });
}
