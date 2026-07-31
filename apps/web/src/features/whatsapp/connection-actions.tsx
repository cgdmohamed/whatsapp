import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { replaceTokenSchema, type WhatsAppStatusDto } from '@wa/shared';
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
  Spinner,
  toast,
} from '@wa/ui';
import { KeyRound, PlugZap, RefreshCcw, Unplug } from 'lucide-react';
import { z } from 'zod';

import { localizedZodResolver } from '../../lib/validation';
import {
  useDisconnectWhatsApp,
  useReplaceWhatsAppToken,
  useSyncWhatsAppAccount,
  useTestWhatsAppConnection,
} from './api';

type ReplaceTokenFormValues = z.infer<typeof replaceTokenSchema>;

function ReplaceTokenDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const replaceMutation = useReplaceWhatsAppToken();
  const form = useForm<ReplaceTokenFormValues>({
    resolver: localizedZodResolver(replaceTokenSchema, t),
    defaultValues: { accessToken: '' },
  });

  const handleClose = (next: boolean) => {
    if (!next) {
      form.reset();
    }
    onOpenChange(next);
  };

  const handleSubmit = async (values: ReplaceTokenFormValues) => {
    try {
      await replaceMutation.mutateAsync(values);
      toast.success(t('whatsapp.tokenReplaced'));
      handleClose(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('whatsapp.replaceTokenTitle')}</DialogTitle>
          <DialogDescription>{t('whatsapp.replaceTokenDescription')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="whatsapp-replace-token-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="accessToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('whatsapp.accessToken')}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="off" dir="ltr" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={replaceMutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="whatsapp-replace-token-form" disabled={replaceMutation.isPending}>
            {replaceMutation.isPending ? <Spinner size="sm" /> : null}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConnectionActions({ status }: { status: WhatsAppStatusDto }) {
  const { t } = useTranslation();
  const testMutation = useTestWhatsAppConnection();
  const syncMutation = useSyncWhatsAppAccount();
  const disconnectMutation = useDisconnectWhatsApp();
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false);
  const [replaceTokenOpen, setReplaceTokenOpen] = React.useState(false);

  const hasCredentials = status.settings.hasAppSecret && status.settings.hasVerifyToken;
  const hasToken = status.account !== null;

  const handleTest = async () => {
    try {
      const result = await testMutation.mutateAsync();
      toast.success(
        result.account
          ? t('whatsapp.connectionTestSuccess', { name: result.account.name ?? result.account.wabaId })
          : t('whatsapp.connectionTestNoAccount'),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSync = async () => {
    try {
      const result = await syncMutation.mutateAsync();
      toast.success(t('whatsapp.syncSuccess', { count: result.phoneNumbers.length }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync();
      toast.success(t('whatsapp.disconnected'));
      setConfirmDisconnect(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={() => setReplaceTokenOpen(true)} disabled={!hasToken}>
        <KeyRound className="h-4 w-4" />
        {t('whatsapp.replaceToken')}
      </Button>
      <Button variant="outline" onClick={() => void handleTest()} disabled={testMutation.isPending || !hasCredentials}>
        {testMutation.isPending ? <Spinner size="sm" /> : <PlugZap className="h-4 w-4" />}
        {t('whatsapp.testConnection')}
      </Button>
      <Button variant="outline" onClick={() => void handleSync()} disabled={syncMutation.isPending || !hasToken}>
        {syncMutation.isPending ? <Spinner size="sm" /> : <RefreshCcw className="h-4 w-4" />}
        {t('whatsapp.sync')}
      </Button>
      <Button
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirmDisconnect(true)}
        disabled={disconnectMutation.isPending || !hasToken}
      >
        <Unplug className="h-4 w-4" />
        {t('whatsapp.disconnect')}
      </Button>

      <ReplaceTokenDialog open={replaceTokenOpen} onOpenChange={setReplaceTokenOpen} />

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('whatsapp.disconnectTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('whatsapp.disconnectDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectMutation.isPending}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDisconnect();
              }}
              disabled={disconnectMutation.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {disconnectMutation.isPending ? <Spinner size="sm" /> : null}
              {t('whatsapp.disconnect')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
