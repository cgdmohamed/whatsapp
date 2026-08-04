import { autoMapColumns, validateImport } from '../src/modules/imports/imports.validator';
import type { ParsedSheet } from '../src/modules/imports/imports.parser';

function parsedFrom(rows: Record<string, unknown>[]): ParsedSheet {
  return {
    sheets: ['csv'],
    selectedSheet: 'csv',
    headers: Object.keys(rows[0] ?? {}),
    rows,
    totalRows: rows.length,
    previewRows: [],
  };
}

const DEFAULT_OPTIONS = {
  defaultCountry: 'EG',
  hasHeader: true,
  updateMode: 'none' as const,
  skipDuplicates: false,
  tagIds: [] as string[],
  treatMissingConsentAsUnknown: true,
};

describe('autoMapColumns', () => {
  it('maps common English headers', () => {
    const mapping = autoMapColumns(['Phone Number', 'First Name', 'Email', 'Company']);
    expect(mapping).toEqual({
      'Phone Number': 'phone',
      'First Name': 'first_name',
      Email: 'email',
      Company: 'company',
    });
  });

  it('maps Arabic headers', () => {
    const mapping = autoMapColumns(['رقم الهاتف', 'الاسم الأول', 'الايميل']);
    expect(mapping['رقم الهاتف']).toBe('phone');
    expect(mapping['الاسم الأول']).toBe('first_name');
    expect(mapping['الايميل']).toBe('email');
  });

  it('maps custom-field Arabic headers (location, city, segment, address)', () => {
    const mapping = autoMapColumns(['الموقع', 'المدينة', 'الشريحة', 'العنوان']);
    expect(mapping['الموقع']).toBe('website');
    expect(mapping['المدينة']).toBe('city');
    expect(mapping['الشريحة']).toBe('segment');
    expect(mapping['العنوان']).toBe('address');
  });

  it('maps English custom-field headers', () => {
    const mapping = autoMapColumns(['Website', 'City', 'Segment', 'Address']);
    expect(mapping['Website']).toBe('website');
    expect(mapping['City']).toBe('city');
    expect(mapping['Segment']).toBe('segment');
    expect(mapping['Address']).toBe('address');
  });

  it('prefers the first header for a field', () => {
    const mapping = autoMapColumns(['Phone', 'Mobile', 'Email']);
    expect(mapping['Phone']).toBe('phone');
    expect(mapping['Mobile']).toBeUndefined();
  });
});

describe('validateImport', () => {
  it('normalizes EG local numbers with Arabic digits', () => {
    const parsed = parsedFrom([{ phone: '٠١٠١٢٣٤٥٦٧٨' }]);
    const result = validateImport(parsed, { phone: 'phone' }, DEFAULT_OPTIONS);
    expect(result.validCount).toBe(1);
    expect(result.candidates[0]?.normalizedPhone).toBe('+201012345678');
  });

  it('flags invalid phones as INVALID_PHONE', () => {
    const parsed = parsedFrom([{ phone: '123' }]);
    const result = validateImport(parsed, { phone: 'phone' }, DEFAULT_OPTIONS);
    expect(result.invalidCount).toBe(1);
    expect(result.issues[0]?.reason).toBe('INVALID_PHONE');
  });

  it('reports a missing phone column', () => {
    const parsed = parsedFrom([{ email: 'a@b.com' }]);
    const result = validateImport(parsed, { email: 'email' }, DEFAULT_OPTIONS);
    expect(result.invalidCount).toBe(1);
    expect(result.issues[0]?.reason).toContain('NO_PHONE_COLUMN');
  });

  it('detects duplicates within the file', () => {
    const parsed = parsedFrom([{ phone: '01012345678' }, { phone: '01012345678' }]);
    const result = validateImport(parsed, { phone: 'phone' }, DEFAULT_OPTIONS);
    expect(result.duplicateInFileCount).toBe(1);
    expect(result.invalidCount).toBe(1);
    expect(result.issues[0]?.reason).toBe('DUPLICATE_IN_FILE');
  });

  it('does not flag duplicates when skipDuplicates is set', () => {
    const parsed = parsedFrom([{ phone: '01012345678' }, { phone: '01012345678' }]);
    const result = validateImport(parsed, { phone: 'phone' }, { ...DEFAULT_OPTIONS, skipDuplicates: true });
    expect(result.invalidCount).toBe(0);
    expect(result.validCount).toBe(2);
  });

  it('parses opt-in status and date', () => {
    const parsed = parsedFrom([{ phone: '01012345678', opt_in_status: 'opted-in', opt_in_date: '15/01/2026', tags: 'vip;new' }]);
    const result = validateImport(
      parsed,
      { phone: 'phone', opt_in_status: 'opt_in_status', opt_in_date: 'opt_in_date', tags: 'tags' },
      DEFAULT_OPTIONS,
    );
    const candidate = result.candidates[0];
    expect(candidate?.optInStatus).toBe('OPTED_IN');
    expect(candidate?.optInDate?.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(candidate?.tags).toEqual(['vip', 'new']);
  });

  it('rejects an invalid email while keeping the phone valid', () => {
    const parsed = parsedFrom([{ phone: '01012345678', email: 'not-an-email' }]);
    const result = validateImport(parsed, { phone: 'phone', email: 'email' }, DEFAULT_OPTIONS);
    expect(result.invalidCount).toBe(1);
    expect(result.issues[0]?.reason).toContain('INVALID_EMAIL');
  });

  it('parses an empty opt-in status as null (no auto opt-in)', () => {
    const parsed = parsedFrom([{ phone: '01012345678', opt_in_status: '' }]);
    const result = validateImport(parsed, { phone: 'phone', opt_in_status: 'opt_in_status' }, DEFAULT_OPTIONS);
    expect(result.candidates[0]?.optInStatus).toBeNull();
    expect(result.validCount).toBe(1);
  });

  it('captures website, city, segment and address into candidate fields', () => {
    const parsed = parsedFrom([
      {
        phone: '01012345678',
        website: 'https://example.com',
        city: 'Riyadh',
        segment: '1 - أولوية قصوى',
        address: 'King Fahd Road 12',
      },
    ]);
    const result = validateImport(
      parsed,
      { phone: 'phone', website: 'website', city: 'city', segment: 'segment', address: 'address' },
      DEFAULT_OPTIONS,
    );
    const candidate = result.candidates[0];
    expect(result.validCount).toBe(1);
    expect(candidate?.fields.website).toBe('https://example.com');
    expect(candidate?.fields.city).toBe('Riyadh');
    expect(candidate?.fields.segment).toBe('1 - أولوية قصوى');
    expect(candidate?.fields.address).toBe('King Fahd Road 12');
  });
});
