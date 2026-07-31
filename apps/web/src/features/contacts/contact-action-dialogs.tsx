import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { OPT_IN_STATUSES, SUPPRESSION_REASONS, type ConsentMutationInput, type ContactDto } from '@wa/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  toast,
} from '@wa/ui';
import { z } from 'zod';

import { useAuth } from '../../lib/auth';
import { localizedZodResolver } from '../../lib/validation';
import { useArchiveContact, useRestoreContact, useSetConsent, useSuppressContact, useUnsuppressContact } from './api';

const consentSchema = z.object({
  status: z.enum(OPT_IN_STATUSES),
  source: z.string().trim().max(100).optional(),
  auditReason: z.string().trim().min(1).max(500).optional(),
});
type ConsentValues = z.infer<typeof consentSchema>;

interface ConsentDialogProps {
  contact: ContactDto;
  onOpenChange: (open: boolean) => void;
}

export function ConsentDialog({ contact, onOpenChange }: ConsentDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const mutation = useSetConsent();
  const isAdmin = user?.role === 'ADMIN';
  const [override, setOverride] = React.useState(false);

  const form = useForm<ConsentValues>({
    resolver: localizedZodResolver(consentSchema, t),
    defaultValues: { status: 'OPTED_IN', source: '', auditReason: '' },
  });

  const handleSubmit = async (values: ConsentValues) => {
    const payload: ConsentMutationInput = {
      status: values.status,
      source: values.source || undefined,
      auditReason: values.auditReason || undefined,
    };
    if (isAdmin && override) {
      payload.override = true;
    }
    try {
      await mutation.mutateAsync({ id: contact.id, input: payload });
      toast.success(t('contacts.consentUpdated'));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('contacts.consentTitle')}</DialogTitle>
          <DialogDescription className="break-all" dir="ltr">
            {contact.phoneE164}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="consent-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('contacts.optInStatus')}</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPT_IN_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {t(`contacts.optIn.${status}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('contacts.optInSource')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="auditReason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('contacts.auditReason')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isAdmin ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} />
                {t('contacts.overrideConsent')}
              </label>
            ) : null}
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="consent-form" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner size="sm" /> : null}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const suppressSchema = z.object({
  reason: z.enum(SUPPRESSION_REASONS),
  source: z.string().trim().max(100).optional(),
  auditReason: z.string().trim().max(500).optional(),
});
type SuppressValues = z.infer<typeof suppressSchema>;

interface SuppressDialogProps {
  contact: ContactDto;
  onOpenChange: (open: boolean) => void;
}

export function SuppressDialog({ contact, onOpenChange }: SuppressDialogProps) {
  const { t } = useTranslation();
  const mutation = useSuppressContact();

  const form = useForm<SuppressValues>({
    resolver: localizedZodResolver(suppressSchema, t),
    defaultValues: { reason: 'OPTED_OUT', source: '', auditReason: '' },
  });

  const handleSubmit = async (values: SuppressValues) => {
    try {
      await mutation.mutateAsync({
        id: contact.id,
        input: {
          reason: values.reason,
          source: values.source || undefined,
          auditReason: values.auditReason || undefined,
        },
      });
      toast.success(t('contacts.suppressed'));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('contacts.suppressTitle')}</DialogTitle>
          <DialogDescription className="break-all" dir="ltr">
            {contact.phoneE164}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="suppress-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('contacts.suppressReason')}</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPRESSION_REASONS.map((reason) => (
                          <SelectItem key={reason} value={reason}>
                            {t(`contacts.reasons.${reason}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('contacts.suppressSource')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="auditReason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('contacts.auditReason')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="suppress-form" variant="destructive" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner size="sm" /> : null}
            {t('contacts.suppress')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface UnsuppressDialogProps {
  contact: ContactDto;
  onOpenChange: (open: boolean) => void;
}

export function UnsuppressDialog({ contact, onOpenChange }: UnsuppressDialogProps) {
  const { t } = useTranslation();
  const mutation = useUnsuppressContact();

  const handleConfirm = async () => {
    try {
      await mutation.mutateAsync(contact.id);
      toast.success(t('contacts.unsuppressed'));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('contacts.unsuppressTitle')}</AlertDialogTitle>
          <AlertDialogDescription className="break-all" dir="ltr">
            {contact.phoneE164}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleConfirm()} disabled={mutation.isPending}>
            {t('common.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface ArchiveDialogProps {
  contact: ContactDto;
  onOpenChange: (open: boolean) => void;
}

export function ArchiveDialog({ contact, onOpenChange }: ArchiveDialogProps) {
  const { t } = useTranslation();
  const isArchived = contact.status === 'ARCHIVED';
  const archiveMutation = useArchiveContact();
  const restoreMutation = useRestoreContact();
  const mutation = isArchived ? restoreMutation : archiveMutation;

  const handleConfirm = async () => {
    try {
      await mutation.mutateAsync(contact.id);
      toast.success(isArchived ? t('contacts.restored') : t('contacts.archived'));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isArchived ? t('contacts.restoreTitle') : t('contacts.archiveTitle')}</AlertDialogTitle>
          <AlertDialogDescription className="break-all" dir="ltr">
            {contact.phoneE164}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleConfirm()} disabled={mutation.isPending}>
            {t('common.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
