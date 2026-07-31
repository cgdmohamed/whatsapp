import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { createContactListSchema, updateContactListSchema, LIST_TYPES, type ContactListDto } from '@wa/shared';
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
  Textarea,
  toast,
} from '@wa/ui';
import { z } from 'zod';

import { localizedZodResolver } from '../../lib/validation';
import { useCreateList, useUpdateList } from '../contacts/api';

const createFormSchema = createContactListSchema;
const editFormSchema = updateContactListSchema;

type CreateFormValues = z.infer<typeof createFormSchema>;
type EditFormValues = z.infer<typeof editFormSchema>;

interface ListFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: ContactListDto | null;
}

export function ListFormDialog({ open, onOpenChange, list }: ListFormDialogProps) {
  const { t } = useTranslation();
  const isEdit = list !== null;
  const createMutation = useCreateList();
  const updateMutation = useUpdateList();

  const createForm = useForm<CreateFormValues>({
    resolver: localizedZodResolver(createFormSchema, t),
    defaultValues: { name: '', description: '', type: 'STATIC' },
  });

  const editForm = useForm<EditFormValues>({
    resolver: localizedZodResolver(editFormSchema, t),
    values: list ? { name: list.name, description: list.description ?? '', type: list.type } : { name: '', description: '', type: 'STATIC' },
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
      await createMutation.mutateAsync({
        name: values.name,
        description: values.description || undefined,
        type: values.type,
      });
      toast.success(t('lists.createdSuccess'));
      onOpenChangeWrapper(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleEdit = async (values: EditFormValues) => {
    if (!list) {
      return;
    }
    const payload: { name?: string; description?: string | null; type?: (typeof LIST_TYPES)[number] } = {};
    if (values.name !== list.name) {
      payload.name = values.name;
    }
    if (values.description !== (list.description ?? '')) {
      payload.description = values.description || null;
    }
    if (values.type !== list.type) {
      payload.type = values.type;
    }
    if (Object.keys(payload).length === 0) {
      onOpenChangeWrapper(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: list.id, input: payload });
      toast.success(t('lists.updatedSuccess'));
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
          <DialogTitle>{isEdit ? t('lists.editTitle') : t('lists.createTitle')}</DialogTitle>
          {isEdit ? (
            <DialogDescription>
              {t('lists.contactCount', { count: list.activeContactCount })}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {isEdit ? (
          <Form {...editForm}>
            <form id="list-edit-form" onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('lists.name')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('lists.type')}</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LIST_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {t(`lists.types.${type}`)}
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
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('lists.description')}</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        ) : (
          <Form {...createForm}>
            <form id="list-create-form" onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('lists.name')} <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('lists.type')}</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LIST_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {t(`lists.types.${type}`)}
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
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('lists.description')}</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value ?? ''} />
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
          <Button type="submit" form={isEdit ? 'list-edit-form' : 'list-create-form'} disabled={busy}>
            {busy ? <Spinner size="sm" /> : null}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
