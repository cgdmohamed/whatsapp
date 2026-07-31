import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export type PhoneNormalizeResult =
  | { ok: true; e164: string; country: string; nationalNumber: string }
  | { ok: false; reason: 'EMPTY' | 'INVALID' };

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

const PERSIAN_DIGITS: Record<string, string> = {
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (digit) => ARABIC_INDIC_DIGITS[digit] ?? digit)
    .replace(/[۰-۹]/g, (digit) => PERSIAN_DIGITS[digit] ?? digit);
}

export function cleanPhoneInput(raw: string): string {
  return normalizeDigits(raw.trim());
}

export const DEFAULT_IMPORT_COUNTRY = 'EG';

export function normalizePhone(raw: string | undefined | null, defaultCountry: string = DEFAULT_IMPORT_COUNTRY): PhoneNormalizeResult {
  if (!raw) {
    return { ok: false, reason: 'EMPTY' };
  }
  const input = cleanPhoneInput(raw);
  if (input.length === 0) {
    return { ok: false, reason: 'EMPTY' };
  }

  // '00' is a common international prefix; treat it like '+'.
  const international = input.startsWith('+') || input.startsWith('00');
  const parseInput = input.startsWith('00') ? `+${input.slice(2)}` : input;

  let parsed;
  try {
    parsed = international
      ? parsePhoneNumberFromString(parseInput)
      : parsePhoneNumberFromString(parseInput, defaultCountry as CountryCode);
  } catch {
    return { ok: false, reason: 'INVALID' };
  }

  if (!parsed || !parsed.isPossible() || !parsed.isValid()) {
    return { ok: false, reason: 'INVALID' };
  }

  return {
    ok: true,
    e164: parsed.number,
    country: parsed.country ?? defaultCountry,
    nationalNumber: parsed.nationalNumber,
  };
}
