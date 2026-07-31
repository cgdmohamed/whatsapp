import { zodResolver } from '@hookform/resolvers/zod';
import type { TFunction } from 'i18next';
import type { Resolver } from 'react-hook-form';
import { z } from 'zod';

type ErrorEntry = { message?: string };

export function localizedZodResolver<Schema extends z.ZodType>(
  schema: Schema,
  t: TFunction,
): Resolver<z.output<Schema>> {
  const base = zodResolver(schema) as unknown as Resolver<z.output<Schema>>;
  return async (values, context, options) => {
    const result = await base(values, context, options);
    if (!result || !('errors' in result)) {
      return result;
    }
    const errors = result.errors as Record<string, ErrorEntry>;
    const localized = Object.fromEntries(
      Object.entries(errors).map(([key, value]) => [
        key,
        value?.message
          ? { ...value, message: t(`validation.${value.message}`, { defaultValue: value.message }) }
          : value,
      ]),
    );
    return { ...result, errors: localized as typeof result.errors };
  };
}
