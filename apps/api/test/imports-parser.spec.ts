import { parseCsv } from '../src/modules/imports/imports.parser';

function encodeWindows1256(text: string): Buffer {
  const decoder = new TextDecoder('windows-1256');
  const bytes: number[] = [];
  for (const char of text) {
    for (let b = 0; b < 256; b += 1) {
      if (decoder.decode(Buffer.from([b])) === char) {
        bytes.push(b);
        break;
      }
    }
  }
  return Buffer.from(bytes);
}

describe('parseCsv encoding', () => {
  it('parses UTF-8 Arabic content', () => {
    const csv = 'name,phone\nعميل محتمل,+201000000000\r\n';
    const result = parseCsv(Buffer.from(csv, 'utf8'));
    expect(result.rows[0]?.name).toBe('عميل محتمل');
  });

  it('strips a UTF-8 BOM', () => {
    const csv = '\uFEFFname,phone\nعميل محتمل,+201000000000\r\n';
    const result = parseCsv(Buffer.from(csv, 'utf8'));
    expect(result.headers[0]).toBe('name');
    expect(result.rows[0]?.name).toBe('عميل محتمل');
  });

  it('decodes Windows-1256 Arabic content', () => {
    const name = encodeWindows1256('عميل محتمل');
    const csv = Buffer.concat([Buffer.from('name,phone\n'), name, Buffer.from(',+201000000000\r\n')]);
    const result = parseCsv(csv);
    expect(result.rows[0]?.name).toBe('عميل محتمل');
  });

  it('preserves ASCII content unchanged', () => {
    const csv = 'name,phone\nAhmed,+201000000000\r\n';
    const result = parseCsv(Buffer.from(csv, 'utf8'));
    expect(result.rows[0]?.name).toBe('Ahmed');
  });
});
