import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { whatsappCredentialsSchema, type WhatsAppCredentialsInput, type WhatsAppStatusDto } from '@wa/shared';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { useSaveWhatsAppCredentials } from './api';

type CredentialsFormValues = z.infer<typeof whatsappCredentialsSchema>;

interface CredentialsFormProps {
  status: WhatsAppStatusDto;
}

export function CredentialsForm({ status }: CredentialsFormProps) {
  const { t } = useTranslation();
  const saveMutation = useSaveWhatsAppCredentials();

  const form = useForm<CredentialsFormValues>({
    resolver: localizedZodResolver(whatsappCredentialsSchema, t),
    defaultValues: {
      name: status.account?.name ?? '',
      appId: status.account?.appId ?? '',
      wabaId: status.account?.wabaId ?? '',
      graphApiVersion: status.settings.graphApiVersion,
    },
  });

  const handleSubmit = async (values: CredentialsFormValues) => {
    const payload: WhatsAppCredentialsInput = {};
    if (values.name && values.name !== (status.account?.name ?? '')) {
      payload.name = values.name;
    }
    if (values.appId && values.appId !== (status.account?.appId ?? '')) {
      payload.appId = values.appId;
    }
    if (values.wabaId && values.wabaId !== (status.account?.wabaId ?? '')) {
      payload.wabaId = values.wabaId;
    }
    if (values.accessToken) {
      payload.accessToken = values.accessToken;
    }
    if (values.appSecret) {
      payload.appSecret = values.appSecret;
    }
    if (values.verifyToken) {
      payload.verifyToken = values.verifyToken;
    }
    if (values.graphApiVersion && values.graphApiVersion !== status.settings.graphApiVersion) {
      payload.graphApiVersion = values.graphApiVersion;
    }

    if (Object.keys(payload).length === 0) {
      toast.info(t('whatsapp.noChanges'));
      return;
    }

    try {
      await saveMutation.mutateAsync(payload);
      form.reset({
        name: payload.name ?? values.name,
        appId: payload.appId ?? values.appId,
        wabaId: payload.wabaId ?? values.wabaId,
        graphApiVersion: payload.graphApiVersion ?? values.graphApiVersion,
      });
      toast.success(t('whatsapp.credentialsSaved'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('whatsapp.credentialsTitle')}</CardTitle>
        <CardDescription>{t('whatsapp.credentialsDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('whatsapp.accountName')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t('whatsapp.accountNamePlaceholder')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="appId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('whatsapp.appId')}</FormLabel>
                    <FormControl>
                      <Input {...field} dir="ltr" placeholder="e.g. 123456789012345" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="wabaId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('whatsapp.wabaId')}</FormLabel>
                    <FormControl>
                      <Input {...field} dir="ltr" placeholder="e.g. 123456789012345" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="graphApiVersion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('whatsapp.graphApiVersion')}</FormLabel>
                    <FormControl>
                      <Input {...field} dir="ltr" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="accessToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('whatsapp.accessToken')}
                      {status.account ? ` · ${t('whatsapp.tokenLastFour', { lastFour: status.account.accessTokenLastFour })}` : ''}
                    </FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="off" dir="ltr" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="appSecret"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('whatsapp.appSecret')}
                      {status.settings.hasAppSecret ? ` · ${t('whatsapp.set')}` : ''}
                    </FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="off" dir="ltr" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="verifyToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('whatsapp.verifyToken')}
                      {status.settings.hasVerifyToken ? ` · ${t('whatsapp.set')}` : ''}
                    </FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="off" dir="ltr" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Spinner size="sm" /> : null}
                {t('common.save')}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
