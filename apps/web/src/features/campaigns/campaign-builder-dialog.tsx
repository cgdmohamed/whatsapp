import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AudienceFilter,
  AudienceSelection,
  AudienceType,
  CampaignDto,
  ContactStatus,
  CreateCampaignInput,
  OptInStatus,
  PreflightReport,
  TemplateComponent,
  VariableMapping,
  VariableSource,
} from '@wa/shared';
import { VARIABLE_SOURCES } from '@wa/shared';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Textarea,
  toast,
} from '@wa/ui';
import { AlertTriangle, ArrowLeft, ArrowRight, Send } from 'lucide-react';

import { useLists, useTags } from '../contacts/api';
import { useWhatsAppStatus } from '../whatsapp/api';
import { useMessageTemplates } from '../whatsapp/templates-api';
import { useCreateCampaign, useScheduleCampaign, useValidateCampaign, useCampaignAction } from './api';

const TYPE_PRIORITY: Record<string, number> = { HEADER: 0, BODY: 1, FOOTER: 2, BUTTONS: 3 };

function collectVariableNames(components: TemplateComponent[] | undefined | null): string[] {
  if (!components) {
    return [];
  }
  const ordered = [...components].sort((a, b) => (TYPE_PRIORITY[a.type] ?? 9) - (TYPE_PRIORITY[b.type] ?? 9));
  const names: string[] = [];
  for (const component of ordered) {
    for (const variable of component.variables) {
      names.push(variable.name);
    }
    if (component.buttons) {
      for (const button of component.buttons) {
        if (button.url) {
          for (const match of button.url.matchAll(/\{\{(\d+)\}\}/g)) {
            names.push(`{{${match[1]}}}`);
          }
        }
      }
    }
  }
  return [...new Set(names)];
}

const STEPS = ['details', 'audience', 'variables', 'review'] as const;
type Step = (typeof STEPS)[number];

interface BuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (campaign: CampaignDto) => void;
}

export function CampaignBuilderDialog({ open, onOpenChange, onCreated }: BuilderProps) {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = React.useState(0);

  // Step 1 — details
  const { data: whatsapp } = useWhatsAppStatus();
  const { data: templates } = useMessageTemplates({
    page: 1,
    pageSize: 50,
    status: 'APPROVED',
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  });
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [templateId, setTemplateId] = React.useState('');
  const [phoneNumberId, setPhoneNumberId] = React.useState('');
  const [language, setLanguage] = React.useState('en_US');
  const [scheduledAt, setScheduledAt] = React.useState('');
  const selectedTemplate = templates?.items.find((template) => template.id === templateId);

  // Step 2 — audience
  const [audienceType, setAudienceType] = React.useState<AudienceType>('LISTS');
  const { data: listsData } = useLists({ page: 1, pageSize: 100 });
  const { data: tagsData } = useTags({ page: 1, pageSize: 100 });
  const [selectedListIds, setSelectedListIds] = React.useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([]);
  const [selectedContactIds, setSelectedContactIds] = React.useState<string[]>([]);
  const [filter, setFilter] = React.useState<AudienceFilter>({});

  // Step 3 — variables
  const [mappings, setMappings] = React.useState<VariableMapping[]>([]);
  React.useEffect(() => {
    setMappings(collectVariableNames(selectedTemplate?.components ?? []).map((variableName) => ({ variableName, source: 'STATIC', staticText: '' })));
  }, [selectedTemplate?.id, selectedTemplate?.components]);

  // Step 4 — create/validate/launch
  const createMutation = useCreateCampaign();
  const validateMutation = useValidateCampaign();
  const scheduleMutation = useScheduleCampaign();
  const startMutation = useCampaignAction('start');
  const [createdCampaign, setCreatedCampaign] = React.useState<CampaignDto | null>(null);
  const [preflight, setPreflight] = React.useState<PreflightReport | null>(null);

  const currentStep: Step = STEPS[stepIndex]!;

  const audienceSelection = React.useMemo<AudienceSelection>(() => {
    switch (audienceType) {
      case 'LISTS':
        return { type: 'LISTS', listIds: selectedListIds };
      case 'TAGS':
        return { type: 'TAGS', tagIds: selectedTagIds };
      case 'CONTACTS':
        return { type: 'CONTACTS', contactIds: selectedContactIds };
      case 'FILTER':
        return { type: 'FILTER', filters: filter };
    }
  }, [audienceType, selectedListIds, selectedTagIds, selectedContactIds, filter]);

  const canNext =
    currentStep === 'details'
      ? name.trim().length > 0 && !!templateId && !!phoneNumberId
      : currentStep === 'audience'
        ? (audienceType === 'LISTS' && selectedListIds.length > 0) ||
          (audienceType === 'TAGS' && selectedTagIds.length > 0) ||
          (audienceType === 'CONTACTS' && selectedContactIds.length > 0) ||
          audienceType === 'FILTER'
        : true;

  const reset = () => {
    setStepIndex(0);
    setName('');
    setDescription('');
    setTemplateId('');
    setPhoneNumberId('');
    setLanguage('en_US');
    setScheduledAt('');
    setAudienceType('LISTS');
    setSelectedListIds([]);
    setSelectedTagIds([]);
    setSelectedContactIds([]);
    setFilter({});
    setMappings([]);
    setCreatedCampaign(null);
    setPreflight(null);
  };

  React.useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open]);

  const toggleId = (id: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const handleCreateAndValidate = async () => {
    const input: CreateCampaignInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      whatsappPhoneNumberId: phoneNumberId,
      messageTemplateId: templateId,
      language,
      audience: audienceSelection,
      variableMapping: mappings.map((mapping) => ({
        ...mapping,
        staticText: mapping.source === 'STATIC' ? (mapping.staticText ?? '') : undefined,
        customFieldKey: mapping.source === 'CUSTOM_FIELD' ? mapping.customFieldKey : undefined,
      })),
    };
    try {
      const created = await createMutation.mutateAsync(input);
      setCreatedCampaign(created);
      const report = await validateMutation.mutateAsync(created.id);
      setPreflight(report);
      if (report.valid) {
        toast.success(t('campaigns.preflightPassed', { eligible: report.breakdown.eligible }));
      } else {
        toast.error(t('campaigns.preflightFailed'));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSchedule = async () => {
    if (!createdCampaign) {
      return;
    }
    if (!scheduledAt) {
      toast.error(t('campaigns.scheduledAtRequired'));
      return;
    }
    try {
      const scheduled = await scheduleMutation.mutateAsync({ id: createdCampaign.id, scheduledAt: new Date(scheduledAt).toISOString() });
      toast.success(t('campaigns.scheduled'));
      onCreated?.(scheduled);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleStartNow = async () => {
    if (!createdCampaign) {
      return;
    }
    try {
      const started = await startMutation.mutateAsync(createdCampaign.id);
      toast.success(t('campaigns.started'));
      onCreated?.(started);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('campaigns.builderTitle')}</DialogTitle>
          <DialogDescription>{t('campaigns.builderDescription')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1.5">
          {STEPS.map((step, index) => (
            <button
              key={step}
              type="button"
              onClick={() => index < stepIndex && setStepIndex(index)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${index === stepIndex ? 'bg-primary text-primary-foreground' : index < stepIndex ? 'bg-muted' : 'bg-muted/50 text-muted-foreground'}`}
            >
              {t(`campaigns.step.${step}`)}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {currentStep === 'details' ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="c-name">{t('campaigns.name')}</Label>
                <Input id="c-name" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-desc">{t('campaigns.description')}</Label>
                <Textarea id="c-desc" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="c-template">{t('campaigns.template')}</Label>
                  <Select value={templateId} onValueChange={(value) => setTemplateId(value)}>
                    <SelectTrigger id="c-template">
                      <SelectValue placeholder={t('campaigns.selectTemplate')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(templates?.items ?? []).map((template) => (
                        <SelectItem key={template.id} value={template.id} className="font-mono">
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-phone">{t('campaigns.phoneNumber')}</Label>
                  <Select value={phoneNumberId} onValueChange={setPhoneNumberId}>
                    <SelectTrigger id="c-phone">
                      <SelectValue placeholder={t('campaigns.selectPhone')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(whatsapp?.phoneNumbers ?? []).map((phone) => (
                        <SelectItem key={phone.id} value={phone.id}>
                          {phone.displayPhoneNumber ?? phone.phoneNumberId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-lang">{t('campaigns.language')}</Label>
                  <Input id="c-lang" dir="ltr" value={language} onChange={(event) => setLanguage(event.target.value)} />
                  {selectedTemplate ? (
                    <p className="text-xs text-muted-foreground">
                      {t('campaigns.templateLanguage', { language: selectedTemplate.language })}
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          ) : currentStep === 'audience' ? (
            <>
              <div className="space-y-1.5">
                <Label>{t('campaigns.audienceTypeLabel')}</Label>
                <Select value={audienceType} onValueChange={(value) => setAudienceType(value as AudienceType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['LISTS', 'TAGS', 'CONTACTS', 'FILTER'] as AudienceType[]).map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`campaigns.audienceType.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {audienceType === 'LISTS' ? (
                <div className="space-y-1.5">
                  <Label>{t('campaigns.lists')}</Label>
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                    {(listsData?.items ?? []).map((list) => (
                      <label key={list.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted">
                        <input
                          type="checkbox"
                          checked={selectedListIds.includes(list.id)}
                          onChange={() => toggleId(list.id, setSelectedListIds)}
                        />
                        <span className="text-sm">{list.name}</span>
                        <span className="ms-auto text-xs text-muted-foreground">{list.activeContactCount}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : audienceType === 'TAGS' ? (
                <div className="space-y-1.5">
                  <Label>{t('campaigns.tags')}</Label>
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                    {(tagsData?.items ?? []).map((tag) => (
                      <label key={tag.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted">
                        <input
                          type="checkbox"
                          checked={selectedTagIds.includes(tag.id)}
                          onChange={() => toggleId(tag.id, setSelectedTagIds)}
                        />
                        <span className="text-sm">{tag.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : audienceType === 'CONTACTS' ? (
                <div className="space-y-1.5">
                  <Label>{t('campaigns.contacts')}</Label>
                  <p className="text-xs text-muted-foreground">{t('campaigns.contactsHint')}</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder={t('campaigns.contactIdPlaceholder')}
                      value={selectedContactIds.join(',')}
                      onChange={(event) =>
                        setSelectedContactIds(
                          event.target.value.split(',').map((id) => id.trim()).filter(Boolean),
                        )
                      }
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{selectedContactIds.length} {t('campaigns.selected')}</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t('campaigns.filterStatus')}</Label>
                    <Select value={filter.status ?? ''} onValueChange={(value) => setFilter((current) => ({ ...current, status: value ? (value as ContactStatus) : undefined }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">{t('common.all')}</SelectItem>
                        {(['ACTIVE', 'INVALID', 'UNSUBSCRIBED', 'BLOCKED'] as ContactStatus[]).map((status) => (
                          <SelectItem key={status} value={status}>{status}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('campaigns.filterLanguage')}</Label>
                    <Select value={filter.language ?? ''} onValueChange={(value) => setFilter((current) => ({ ...current, language: value ? (value as 'ar' | 'en') : undefined }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">{t('common.all')}</SelectItem>
                        <SelectItem value="ar">Arabic</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('campaigns.filterOptIn')}</Label>
                    <Select value={filter.optInStatus ?? ''} onValueChange={(value) => setFilter((current) => ({ ...current, optInStatus: value ? (value as OptInStatus) : undefined }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">{t('common.all')}</SelectItem>
                        <SelectItem value="OPTED_IN">Opted in</SelectItem>
                        <SelectItem value="OPTED_OUT">Opted out</SelectItem>
                        <SelectItem value="UNKNOWN">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('campaigns.filterSuppressed')}</Label>
                    <Select value={filter.suppressed ?? ''} onValueChange={(value) => setFilter((current) => ({ ...current, suppressed: value ? (value as 'yes' | 'no') : undefined }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">{t('common.all')}</SelectItem>
                        <SelectItem value="no">Not suppressed</SelectItem>
                        <SelectItem value="yes">Suppressed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </>
          ) : currentStep === 'variables' ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('campaigns.variablesHint')}</p>
              {mappings.map((mapping, index) => (
                <div key={mapping.variableName} className="grid items-center gap-2 rounded-md border p-3 sm:grid-cols-[90px_1fr_1fr_1fr]">
                  <Badge variant="outline" className="font-mono justify-center" dir="ltr">
                    {mapping.variableName}
                  </Badge>
                  <Select
                    value={mapping.source}
                    onValueChange={(value) =>
                      setMappings((current) => {
                        const next = [...current];
                        next[index] = { ...next[index]!, source: value as VariableSource };
                        return next;
                      })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VARIABLE_SOURCES.map((source) => (
                        <SelectItem key={source} value={source}>
                          {t(`campaigns.source.${source}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mapping.source === 'CUSTOM_FIELD' ? (
                    <Input
                      dir="ltr"
                      placeholder={t('campaigns.customFieldKey')}
                      value={mapping.customFieldKey ?? ''}
                      onChange={(event) =>
                        setMappings((current) => {
                          const next = [...current];
                          next[index] = { ...next[index]!, customFieldKey: event.target.value };
                          return next;
                        })
                      }
                    />
                  ) : mapping.source === 'STATIC' ? (
                    <Input
                      dir="ltr"
                      placeholder={t('campaigns.staticText')}
                      value={mapping.staticText ?? ''}
                      onChange={(event) =>
                        setMappings((current) => {
                          const next = [...current];
                          next[index] = { ...next[index]!, staticText: event.target.value };
                          return next;
                        })
                      }
                    />
                  ) : (
                    <span />
                  )}
                  <Input
                    dir="ltr"
                    placeholder={t('campaigns.fallback')}
                    value={mapping.fallback ?? ''}
                    onChange={(event) =>
                      setMappings((current) => {
                        const next = [...current];
                        next[index] = { ...next[index]!, fallback: event.target.value };
                        return next;
                      })
                    }
                  />
                </div>
              ))}
              {mappings.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('campaigns.noVariables')}</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              {preflight ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="c-schedule">{t('campaigns.scheduledAt')}</Label>
                    <Input id="c-schedule" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
                  </div>

                  {preflight.valid ? (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>{t('campaigns.preflightPassed', { eligible: preflight.breakdown.eligible })}</AlertTitle>
                      <AlertDescription>{t('campaigns.preflightPassedHint')}</AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>{t('campaigns.preflightFailed')}</AlertTitle>
                      <AlertDescription>
                        <ul className="mt-1 list-disc ps-4">
                          {preflight.errors.map((error) => (
                            <li key={error}>{error}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <Breakdown label={t('campaigns.breakdown.eligible')} value={preflight.breakdown.eligible} />
                    <Breakdown label={t('campaigns.breakdown.invalidPhone')} value={preflight.breakdown.invalidPhone} destructive />
                    <Breakdown label={t('campaigns.breakdown.unknownConsent')} value={preflight.breakdown.unknownConsent} destructive />
                    <Breakdown label={t('campaigns.breakdown.optedOut')} value={preflight.breakdown.optedOut} destructive />
                    <Breakdown label={t('campaigns.breakdown.suppressed')} value={preflight.breakdown.suppressed} destructive />
                    <Breakdown label={t('campaigns.breakdown.missingVariable')} value={preflight.breakdown.missingVariable} destructive />
                    <Breakdown label={t('campaigns.breakdown.duplicate')} value={preflight.breakdown.duplicate} destructive />
                    <Breakdown label={t('campaigns.breakdown.archived')} value={preflight.breakdown.archived} destructive />
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t('campaigns.reviewHint')}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {stepIndex > 0 ? (
            <Button variant="outline" onClick={() => setStepIndex((index) => index - 1)}>
              <ArrowLeft className="h-4 w-4" />
              {t('common.back')}
            </Button>
          ) : null}
          {stepIndex < STEPS.length - 1 ? (
            <Button disabled={!canNext} onClick={() => setStepIndex((index) => index + 1)}>
              {t('common.next')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : createdCampaign ? (
            <>
              <Button variant="outline" onClick={() => void handleStartNow()} disabled={!preflight?.valid || startMutation.isPending}>
                {startMutation.isPending ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
                {t('campaigns.startNow')}
              </Button>
              <Button onClick={() => void handleSchedule()} disabled={!preflight?.valid || scheduleMutation.isPending}>
                {scheduleMutation.isPending ? <Spinner size="sm" /> : null}
                {t('campaigns.schedule')}
              </Button>
            </>
          ) : (
            <Button onClick={() => void handleCreateAndValidate()} disabled={createMutation.isPending || validateMutation.isPending}>
              {createMutation.isPending || validateMutation.isPending ? <Spinner size="sm" /> : null}
              {t('campaigns.createAndValidate')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Breakdown({ label, value, destructive }: { label: string; value: number; destructive?: boolean }) {
  return (
    <div className={`rounded-md border p-2 text-center ${destructive && value > 0 ? 'border-destructive/40 text-destructive' : ''}`}>
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}