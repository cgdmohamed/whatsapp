import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { createTagSchema, updateTagSchema, type TagDto } from '@wa/shared';
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
  Textarea,
  toast,
} from '@wa/ui';
import { z } from 'zod';

import { localizedZodResolver } from '../../lib/validation';
import { useCreateTag, useUpdateTag } from '../contacts/api';

const createFormSchema = createTagSchema;
const editFormSchema = updateTagSchema;

type CreateFormValues = z.infer<typeof createFormSchema>;
type EditFormValues = z.infer<typeof editFormSchema>;

interface TagFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag: TagDto | null;
}

export function TagFormDialog({ open, onOpenChange, tag }: TagFormDialogProps) {
  const { t } = useTranslation();
  const isEdit = tag !== null;
  const createMutation = useCreateTag();
  const updateMutation = useUpdateTag();

  const createForm = useForm<CreateFormValues>({
    resolver: localizedZodResolver(createFormSchema, t),
    defaultValues: { name: '', description: '' },
  });

  const editForm = useForm<EditFormValues>({
    resolver: localizedZodResolver(editFormSchema, t),
    values: tag ? { name: tag.name, description: tag.description ?? '' } : { name: '', description: '' },
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
      await createMutation.mutateAsync({ name: values.name, description: values.description || undefined });
      toast.success(t('tags.createdSuccess'));
      onOpenChangeWrapper(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleEdit = async (values: EditFormValues) => {
    if (!tag) {
      return;
    }
    const payload: { name?: string; description?: string | null } = {};
    if (values.name !== tag.name) {
      payload.name = values.name;
    }
    if (values.description !== (tag.description ?? '')) {
      payload.description = values.description || null;
    }
    if (Object.keys(payload).length === 0) {
      onOpenChangeWrapper(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: tag.id, input: payload });
      toast.success(t('tags.updatedSuccess'));
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
          <DialogTitle>{isEdit ? t('tags.editTitle') : t('tags.createTitle')}</DialogTitle>
          {isEdit ? <DialogDescription>{tag?.slug}</DialogDescription> : null}
        </DialogHeader>

        {isEdit ? (
          <Form {...editForm}>
            <form id="tag-edit-form" onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('tags.name')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                    <FormLabel>{t('tags.description')}</FormLabel>
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
            <form id="tag-create-form" onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('tags.name')} <span className="text-destructive">*</span>
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
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('tags.description')}</FormLabel>
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
          <Button type="submit" form={isEdit ? 'tag-edit-form' : 'tag-create-form'} disabled={busy}>
            {busy ? <Spinner size="sm" /> : null}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
