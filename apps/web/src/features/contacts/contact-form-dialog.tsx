import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { CONTACT_SOURCES, LANGUAGES, OPT_IN_STATUSES, createContactSchema, type ContactDto } from '@wa/shared';
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
import { useCreateContact, useUpdateContact } from './api';

const createFormSchema = createContactSchema.pick({
  phone: true,
  phoneCountry: true,
  firstName: true,
  lastName: true,
  displayName: true,
  email: true,
  company: true,
  language: true,
  source: true,
  optInStatus: true,
  optInSource: true,
});

const editFormSchema = z.object({
  phone: z.string().trim().min(3).max(30).optional(),
  phoneCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'INVALID_COUNTRY_CODE').optional(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  displayName: z.string().trim().max(160).optional(),
  email: z.string().trim().toLowerCase().email('INVALID_EMAIL').max(255).optional(),
  company: z.string().trim().max(160).optional(),
  language: z.enum(LANGUAGES).optional(),
  source: z.string().trim().max(100).optional(),
});

type CreateFormValues = z.infer<typeof createFormSchema>;
type EditFormValues = z.infer<typeof editFormSchema>;

interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: ContactDto | null;
}

export function ContactFormDialog({ open, onOpenChange, contact }: ContactFormDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isEdit = contact !== null;
  const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const createMutation = useCreateContact();
  const updateMutation = useUpdateContact();

  const createForm = useForm<CreateFormValues>({
    resolver: localizedZodResolver(createFormSchema, t),
    defaultValues: {
      phone: '',
      phoneCountry: '',
      firstName: '',
      lastName: '',
      displayName: '',
      email: '',
      company: '',
      language: 'ar',
      source: '',
      optInStatus: undefined,
      optInSource: '',
    },
  });

  const editForm = useForm<EditFormValues>({
    resolver: localizedZodResolver(editFormSchema, t),
    values: contact
      ? {
          phone: contact.phoneE164,
          phoneCountry: contact.phoneCountry ?? '',
          firstName: contact.firstName ?? '',
          lastName: contact.lastName ?? '',
          displayName: contact.displayName ?? '',
          email: contact.email ?? '',
          company: contact.company ?? '',
          language: contact.language ?? 'ar',
          source: contact.source ?? '',
        }
      : {
          phone: '',
          phoneCountry: '',
          firstName: '',
          lastName: '',
          displayName: '',
          email: '',
          company: '',
          language: 'ar',
          source: '',
        },
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
        ...values,
        phoneCountry: values.phoneCountry || undefined,
        email: values.email || undefined,
        source: values.source || undefined,
        optInStatus: values.optInStatus || undefined,
        optInSource: values.optInSource || undefined,
      });
      toast.success(t('contacts.createdSuccess'));
      onOpenChangeWrapper(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleEdit = async (values: EditFormValues) => {
    if (!contact) {
      return;
    }
    const payload: Record<string, string | null> = {};
    const fields: Array<'firstName' | 'lastName' | 'displayName' | 'email' | 'company' | 'language' | 'source'> = [
      'firstName',
      'lastName',
      'displayName',
      'email',
      'company',
      'language',
      'source',
    ];
    for (const field of fields) {
      const next = values[field] ?? null;
      const current = contact[field] ?? null;
      if (next !== current) {
        payload[field] = next;
      }
    }
    if (isManagerOrAdmin) {
      if (values.phone && values.phone !== contact.phoneE164) {
        payload.phone = values.phone;
      }
      if (values.phoneCountry && values.phoneCountry !== (contact.phoneCountry ?? '')) {
        payload.phoneCountry = values.phoneCountry;
      }
    }
    if (Object.keys(payload).length === 0) {
      onOpenChangeWrapper(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: contact.id, input: payload });
      toast.success(t('contacts.updatedSuccess'));
      onOpenChangeWrapper(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChangeWrapper}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('contacts.editTitle') : t('contacts.createTitle')}</DialogTitle>
          {isEdit ? (
            <DialogDescription className="break-all" dir="ltr">
              {contact?.phoneE164}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {isEdit ? (
          <Form {...editForm}>
            <form id="contact-edit-form" onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={editForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('contacts.firstName')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('contacts.lastName')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contacts.displayName')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contacts.email')}</FormLabel>
                    <FormControl>
                      <Input type="email" dir="ltr" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={editForm.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('contacts.company')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('contacts.language')}</FormLabel>
                      <FormControl>
                        <Select value={field.value ?? ''} onValueChange={field.onChange}>
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
              </div>
              {isManagerOrAdmin ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={editForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('contacts.phone')}</FormLabel>
                          <FormControl>
                            <Input dir="ltr" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="phoneCountry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('contacts.phoneCountry')}</FormLabel>
                          <FormControl>
                            <Input dir="ltr" maxLength={2} placeholder="EG" className="uppercase" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={editForm.control}
                    name="source"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('common.source')}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              ) : null}
            </form>
          </Form>
        ) : (
          <Form {...createForm}>
            <form id="contact-create-form" onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={createForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('contacts.phone')} <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input dir="ltr" placeholder="+2010..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="phoneCountry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('contacts.phoneCountry')}</FormLabel>
                      <FormControl>
                        <Input dir="ltr" maxLength={2} placeholder="EG" className="uppercase" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={createForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('contacts.firstName')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('contacts.lastName')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={createForm.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contacts.displayName')}</FormLabel>
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
                    <FormLabel>{t('contacts.email')}</FormLabel>
                    <FormControl>
                      <Input type="email" dir="ltr" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={createForm.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('contacts.company')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('contacts.language')}</FormLabel>
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
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={createForm.control}
                  name="optInStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('contacts.optInStatus')}</FormLabel>
                      <FormControl>
                        <Select value={field.value ?? ''} onValueChange={(value) => field.onChange(value || undefined)}>
                          <SelectTrigger>
                            <SelectValue placeholder={t('common.none')} />
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
                  control={createForm.control}
                  name="optInSource"
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
              </div>
              <FormField
                control={createForm.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common.source')}</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONTACT_SOURCES.map((source) => (
                            <SelectItem key={source} value={source}>
                              {t(`contacts.source.${source}`)}
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
          <Button type="submit" form={isEdit ? 'contact-edit-form' : 'contact-create-form'} disabled={busy}>
            {busy ? <Spinner size="sm" /> : null}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
