import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { resetPasswordSchema, type UserDto } from '@wa/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Spinner,
  toast,
} from '@wa/ui';
import { z } from 'zod';

import { localizedZodResolver } from '../../lib/validation';
import { useResetPassword } from './api';

const formSchema = resetPasswordSchema
  .extend({
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'PASSWORD_MISMATCH',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof formSchema>;

interface ResetPasswordDialogProps {
  user: UserDto | null;
  onOpenChange: (open: boolean) => void;
}

export function ResetPasswordDialog({ user, onOpenChange }: ResetPasswordDialogProps) {
  const { t } = useTranslation();
  const mutation = useResetPassword(user?.id ?? '');

  const form = useForm<FormValues>({
    resolver: localizedZodResolver(formSchema, t),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const handleClose = (open: boolean) => {
    if (!open) {
      form.reset();
    }
    onOpenChange(open);
  };

  const handleSubmit = async (values: FormValues) => {
    try {
      await mutation.mutateAsync({ password: values.password });
      toast.success(t('users.resetPasswordSuccess'));
      handleClose(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open={user !== null} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('users.resetPasswordTitle')}</DialogTitle>
          <DialogDescription>
            {t('users.resetPasswordDescription', { name: user?.name ?? '' })}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="reset-password-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('users.password')}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
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
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="reset-password-form" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner size="sm" /> : null}
            {t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
