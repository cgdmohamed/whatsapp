import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { LANGUAGES, userSchema, type UserDto } from '@wa/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Spinner,
  toast,
} from '@wa/ui';
import { KeyRound, LogOut, UserRound } from 'lucide-react';
import { z } from 'zod';

import { useAuth } from '../lib/auth';
import { apiFetch } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';
import { localizedZodResolver } from '../lib/validation';
import { PageHeader } from '../components/page-header';

const profileFormSchema = userSchema.pick({ name: true, preferredLanguage: true });
type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm<ProfileFormValues>({
    resolver: localizedZodResolver(profileFormSchema, t),
    values: user ? { name: user.name, preferredLanguage: user.preferredLanguage } : undefined,
  });

  const updateMutation = useMutation({
    mutationFn: (values: ProfileFormValues) =>
      apiFetch<UserDto>(`/users/${user?.id}`, { method: 'PATCH', body: JSON.stringify(values) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast.success(t('profile.savedSuccess'));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : String(error));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => apiFetch<{ success: true }>('/auth/revoke-sessions', { method: 'POST' }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['auth'] });
      navigate('/login', { replace: true });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : String(error));
    },
  });

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('profile.title')} description={t('profile.description')} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="h-4 w-4 text-muted-foreground" />
              {t('profile.accountInfo')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3">
              <span className="text-muted-foreground">{t('users.name')}</span>
              <span className="font-medium">{user.name}</span>
              <span className="text-muted-foreground">{t('users.email')}</span>
              <span dir="ltr">{user.email}</span>
              <span className="text-muted-foreground">{t('users.role')}</span>
              <Badge variant="secondary" className="w-fit">
                {t(`roles.${user.role}`)}
              </Badge>
              <span className="text-muted-foreground">{t('users.status')}</span>
              <span className="font-medium">{t(`status.${user.status}`)}</span>
              <span className="text-muted-foreground">{t('profile.memberSince')}</span>
              <span>{formatDate(user.createdAt)}</span>
              <span className="text-muted-foreground">{t('users.lastLogin')}</span>
              <span>{formatDateTime(user.lastLoginAt)}</span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('profile.personalInformation')}</CardTitle>
              <CardDescription>{t('profile.personalInformation')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form
                  id="profile-form"
                  onSubmit={form.handleSubmit((values) => updateMutation.mutate(values))}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('profile.displayName')}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="preferredLanguage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('profile.preferredLanguage')}</FormLabel>
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
                  <div className="flex justify-end">
                    <Button type="submit" disabled={updateMutation.isPending}>
                      {updateMutation.isPending ? <Spinner size="sm" /> : null}
                      {t('common.save')}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('profile.security')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/change-password')}>
                <KeyRound className="h-4 w-4" />
                {t('common.changePassword')}
              </Button>
              <Separator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-destructive hover:text-destructive"
                    disabled={revokeMutation.isPending}
                  >
                    <LogOut className="h-4 w-4" />
                    {t('auth.revokeSessionsTitle')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('auth.revokeSessionsTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('auth.revokeSessionsDescription')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel asChild>
                      <Button variant="outline" disabled={revokeMutation.isPending}>
                        {t('common.cancel')}
                      </Button>
                    </AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <Button
                        variant="destructive"
                        onClick={() => revokeMutation.mutate()}
                        disabled={revokeMutation.isPending}
                      >
                        {t('common.confirm')}
                      </Button>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
