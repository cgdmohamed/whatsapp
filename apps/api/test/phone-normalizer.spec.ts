import { normalizePhone } from '../src/modules/contacts/phone/phone-normalizer';

describe('normalizePhone', () => {
  describe('Egyptian local numbers', () => {
    it('normalizes a bare 11-digit mobile number', () => {
      const result = normalizePhone('01012345678');
      expect(result).toMatchObject({ ok: true, e164: '+201012345678', country: 'EG', nationalNumber: '1012345678' });
    });

    it('normalizes with the leading 0 dropped for E.164', () => {
      expect(normalizePhone('01223456789')).toMatchObject({ e164: '+201223456789', country: 'EG' });
    });

    it('accepts spaces and dashes', () => {
      expect(normalizePhone('010 123 4567 8')).toMatchObject({ ok: true, e164: '+201012345678' });
      expect(normalizePhone('010-1234-5678')).toMatchObject({ ok: true, e164: '+201012345678' });
    });

    it('accepts parenthesized area codes', () => {
      expect(normalizePhone('(010) 12345678')).toMatchObject({ ok: true, e164: '+201012345678' });
    });

    it('accepts a 10-digit mobile number with country hint', () => {
      expect(normalizePhone('0123456789', 'EG')).toMatchObject({ ok: true, e164: '+20123456789' });
    });
  });

  describe('international numbers', () => {
    it('accepts +20 prefixed numbers', () => {
      expect(normalizePhone('+201012345678')).toMatchObject({ ok: true, e164: '+201012345678', country: 'EG' });
    });

    it('accepts numbers for other countries', () => {
      expect(normalizePhone('+14155552671')).toMatchObject({ ok: true, e164: '+14155552671', country: 'US' });
      expect(normalizePhone('+447911123456')).toMatchObject({ ok: true, e164: '+447911123456' });
      expect(normalizePhone('+971501234567')).toMatchObject({ ok: true, e164: '+971501234567', country: 'AE' });
    });

    it('accepts 00 dial prefix as +', () => {
      expect(normalizePhone('00201012345678')).toMatchObject({ ok: true, e164: '+201012345678', country: 'EG' });
    });

    it('accepts an international number without + when a different default country is given', () => {
      expect(normalizePhone('14155552671', 'US')).toMatchObject({ ok: true, e164: '+14155552671', country: 'US' });
    });
  });

  describe('Arabic/Persian digits', () => {
    it('converts Arabic-Indic digits to western digits', () => {
      expect(normalizePhone('٠١٠١٢٣٤٥٦٧٨')).toMatchObject({ ok: true, e164: '+201012345678' });
    });

    it('converts Persian digits to western digits', () => {
      expect(normalizePhone('۰۱۰۱۲۳۴۵۶۷۸')).toMatchObject({ ok: true, e164: '+201012345678' });
    });

    it('converts mixed Arabic/Persian digits', () => {
      expect(normalizePhone('٠۱۰٦٣٨٢٧١٥٤')).toMatchObject({ ok: true, e164: '+201063827154' });
    });
  });

  describe('rejections', () => {
    it('rejects empty input', () => {
      expect(normalizePhone('')).toEqual({ ok: false, reason: 'EMPTY' });
      expect(normalizePhone('   ')).toEqual({ ok: false, reason: 'EMPTY' });
    });

    it('rejects clearly invalid short numbers', () => {
      expect(normalizePhone('123')).toEqual({ ok: false, reason: 'INVALID' });
      expect(normalizePhone('abc')).toEqual({ ok: false, reason: 'INVALID' });
    });

    it('accepts an EG landline (valid local number)', () => {
      expect(normalizePhone('0234567890', 'EG')).toMatchObject({ ok: true, e164: '+20234567890', country: 'EG' });
    });

    it('rejects ambiguous numbers without a country hint', () => {
      expect(normalizePhone('12345678901')).toEqual({ ok: false, reason: 'INVALID' });
    });
  });
});
