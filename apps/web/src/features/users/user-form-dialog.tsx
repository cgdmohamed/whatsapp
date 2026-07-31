import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { createUserSchema, LANGUAGES, ROLES, type UserDto } from '@wa/shared';
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
import { useCreateUser, useUpdateUser } from './api';

const createFormSchema = createUserSchema;
const editFormSchema = createUserSchema.pick({ name: true, role: true, preferredLanguage: true });

type CreateFormValues = z.infer<typeof createFormSchema>;
type EditFormValues = z.infer<typeof editFormSchema>;

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserDto | null;
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const isEdit = user !== null;
  const isSelf = isEdit && user.id === currentUser?.id;
  const isAdmin = currentUser?.role === 'ADMIN';
  const creatableRoles = ROLES.filter((role) => isAdmin || role !== 'ADMIN');

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser(user?.id ?? '');

  const createForm = useForm<CreateFormValues>({
    resolver: localizedZodResolver(createFormSchema, t),
    defaultValues: { name: '', email: '', role: 'AGENT', password: '', preferredLanguage: 'ar' },
  });

  const editForm = useForm<EditFormValues>({
    resolver: localizedZodResolver(editFormSchema, t),
    values: user
      ? { name: user.name, role: user.role, preferredLanguage: user.preferredLanguage }
      : { name: '', role: 'AGENT', preferredLanguage: 'ar' },
  });

  const onOpenChangeWrapper = (next: boolean) => {
    if (!next) {
      createForm.reset();
      editForm.reset();
    }
    onOpenChange(next);
  };

  const handleCreate = async (values: CreateFormValues) => {
    try {
      await createMutation.mutateAsync(values);
      toast.success(t('users.createdSuccess'));
      onOpenChangeWrapper(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleEdit = async (values: EditFormValues) => {
    if (!user) {
      return;
    }
    const payload: Partial<EditFormValues> = {};
    if (values.name !== user.name) {
      payload.name = values.name;
    }
    if (!isSelf && values.role !== user.role) {
      payload.role = values.role;
    }
    if (values.preferredLanguage !== user.preferredLanguage) {
      payload.preferredLanguage = values.preferredLanguage;
    }
    if (Object.keys(payload).length === 0) {
      onOpenChangeWrapper(false);
      return;
    }
    try {
      await updateMutation.mutateAsync(payload);
      toast.success(t('users.updatedSuccess'));
      onOpenChangeWrapper(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChangeWrapper}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('users.editTitle') : t('users.createTitle')}</DialogTitle>
          <DialogDescription>{isEdit ? user?.email : undefined}</DialogDescription>
        </DialogHeader>

        {isEdit ? (
          <Form {...editForm}>
            <form id="user-edit-form" onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.name')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.role')}</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isSelf || !isAdmin}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {t(`roles.${role}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    {isSelf ? <FormMessage>{t('users.cannotModifyOwnRole')}</FormMessage> : <FormMessage />}
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="preferredLanguage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.language')}</FormLabel>
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
            </form>
          </Form>
        ) : (
          <Form {...createForm}>
            <form id="user-create-form" onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.name')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.email')}</FormLabel>
                    <FormControl>
                      <Input type="email" dir="ltr" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.role')}</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {creatableRoles.map((role) => (
                            <SelectItem key={role} value={role}>
                              {t(`roles.${role}`)}
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
                control={createForm.control}
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
                control={createForm.control}
                name="preferredLanguage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.language')}</FormLabel>
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
            </form>
          </Form>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChangeWrapper(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={isEdit ? 'user-edit-form' : 'user-create-form'} disabled={busy}>
            {busy ? <Spinner size="sm" /> : null}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
