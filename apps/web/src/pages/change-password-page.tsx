import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { changePasswordSchema, type ChangePasswordInput } from '@wa/shared';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input, Spinner } from '@wa/ui';
import { z } from 'zod';

import { apiFetch } from '../lib/api';
import { localizedZodResolver } from '../lib/validation';

const formSchema = changePasswordSchema
  .extend({
    confirmNewPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'PASSWORD_MISMATCH',
    path: ['confirmNewPassword'],
  });

type FormValues = z.infer<typeof formSchema>;

export function ChangePasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useForm<FormValues>({
    resolver: localizedZodResolver(formSchema, t),
    defaultValues: { currentPassword: '', newPassword: '', confirmNewPassword: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    const payload: ChangePasswordInput = {
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    };
    try {
      await apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify(payload) });
      queryClient.removeQueries({ queryKey: ['auth'] });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (success) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 py-16 text-center">
        <h2 className="text-2xl font-semibold">{t('auth.passwordChanged')}</h2>
        <p className="text-sm text-muted-foreground">{t('auth.changePasswordSuccess')}</p>
        <Button onClick={() => navigate('/login', { replace: true })}>{t('auth.signIn')}</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>{t('auth.changePasswordTitle')}</CardTitle>
          <CardDescription>{t('auth.changePasswordDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="mb-4 rounded-lg border border-destructive/50 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.currentPassword')}</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.newPassword')}</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmNewPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.confirmNewPassword')}</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Spinner size="sm" /> : null}
                {t('common.save')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
