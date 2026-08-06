export function toMoney(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toMoneyZero(value: string | number | null | undefined): number {
  return toMoney(value) ?? 0;
}
