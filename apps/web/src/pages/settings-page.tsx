import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { LANGUAGES, settingsSchema, type SettingsDto } from '@wa/shared';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
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
  Skeleton,
  Spinner,
  toast,
} from '@wa/ui';
import { Info } from 'lucide-react';

import { apiFetch } from '../lib/api';
import { localizedZodResolver } from '../lib/validation';
import { PageHeader } from '../components/page-header';

function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<SettingsDto>('/settings'),
  });
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useSettings();

  const form = useForm<SettingsDto>({
    resolver: localizedZodResolver(settingsSchema, t),
    values: data,
  });

  const mutation = useMutation({
    mutationFn: (values: SettingsDto) =>
      apiFetch<SettingsDto>('/settings', { method: 'PUT', body: JSON.stringify(values) }),
    onSuccess: (updated) => {
      form.reset(updated);
      toast.success(t('settings.savedSuccess'));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : String(error));
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('settings.title')} description={t('settings.description')} />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('settings.title')} description={t('settings.description')} />
        <ErrorState
          title={t('settings.loadError')}
          retryLabel={t('common.retry')}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.title')} description={t('settings.description')} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('settings.general')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.companyName')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultTimezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.defaultTimezone')}</FormLabel>
                      <FormControl>
                        <Input {...field} dir="ltr" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultCountry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.defaultCountry')}</FormLabel>
                      <FormControl>
                        <Input {...field} dir="ltr" maxLength={2} className="uppercase" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultLanguage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.defaultLanguage')}</FormLabel>
                      <FormControl>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LANGUAGES.map((lang) => (
                              <SelectItem key={lang} value={lang}>
                                {t(`languages.${lang}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('settings.limits')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="maxImportFileSizeMb"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.maxImportFileSizeMb')}</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={1024} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sessionDurationMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.sessionDurationMinutes')}</FormLabel>
                      <FormControl>
                        <Input type="number" min={5} max={1440} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('settings.campaigns')}</CardTitle>
              <CardDescription className="flex items-center gap-1.5">
                <Info className="h-4 w-4 shrink-0" />
                {t('settings.placeholderNote')}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="campaignSendingConcurrency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.campaignSendingConcurrency')}</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="campaignMessagesPerMinute"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.campaignMessagesPerMinute')}</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={60000} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Spinner size="sm" /> : null}
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
