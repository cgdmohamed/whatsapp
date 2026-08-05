import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type {
  CreateMessageTemplateButtonInput,
  CreateMessageTemplateComponentInput,
  CreateMessageTemplateInput,
  MessageTemplateDto,
  MessageTemplateQuery,
  PreviewSampleValues,
  TemplateCategory,
  TemplateComponent,
  TemplateStatus,
} from '@wa/shared';
import { TEMPLATE_CATEGORIES, TEMPLATE_STATUSES } from '@wa/shared';
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
  EmptyState,
  ErrorState,
  Input,
  Label,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
} from '@wa/ui';
import { AlertTriangle, FileText, Plug, Plus, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../lib/auth';
import { formatDateTime } from '../../lib/format';
import { ApiClientError } from '../../lib/api';
import { EmptyStateHelpLink } from '../help/empty-state-help-link';
import { TemplateLivePreview } from '../preview/template-live-preview';
import { useCreateTemplate, useMessageTemplates, useSyncTemplates, useTemplateSyncStatus } from './templates-api';

const STATUS_BADGE: Record<TemplateStatus, 'default' | 'secondary' | 'outline' | 'warning' | 'success' | 'destructive' | 'muted'> = {
  APPROVED: 'success',
  PENDING: 'secondary',
  REJECTED: 'destructive',
  IN_APPEAL: 'secondary',
  PAUSED: 'warning',
  DISABLED: 'destructive',
  DELETED: 'muted',
};

const TYPE_PRIORITY: Record<string, number> = { HEADER: 0, BODY: 1, FOOTER: 2, BUTTONS: 3 };

function collectVarNames(components: TemplateComponent[]): string[] {
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
  return names;
}

function renderText(text: string | null | undefined, samples: string[]): string {
  if (!text) {
    return '';
  }
  return text.replace(/\{\{(\d+)\}\}/g, (_match, number: string) => {
    const index = Number(number) - 1;
    return index >= 0 && index < samples.length && samples[index] ? samples[index] : `{{${number}}}`;
  });
}

// ---------- Preview dialog ----------

function TemplatePreviewDialog({
  template,
  open,
  onOpenChange,
}: {
  template: MessageTemplateDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const varNames = React.useMemo(() => (template ? collectVarNames(template.components) : []), [template]);
  const [samples, setSamples] = React.useState<string[]>([]);

  React.useEffect(() => {
    setSamples(varNames.map(() => ''));
  }, [varNames]);

  if (!template) {
    return null;
  }

  const header = template.components.find((c) => c.type === 'HEADER');
  const body = template.components.find((c) => c.type === 'BODY');
  const footer = template.components.find((c) => c.type === 'FOOTER');
  const buttonsComp = template.components.find((c) => c.type === 'BUTTONS');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-mono" dir="ltr">
            {template.name}
          </DialogTitle>
          <DialogDescription>
            {template.language} · {t(`templates.category.${template.category}`)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm" dir="auto">
            {header?.text ? (
              <p className="font-medium">{renderText(header.text, samples)}</p>
            ) : null}
            {body?.text ? (
              <p className="whitespace-pre-wrap">{renderText(body.text, samples)}</p>
            ) : null}
            {footer?.text ? (
              <p className="text-xs text-muted-foreground">{renderText(footer.text, samples)}</p>
            ) : null}
            {buttonsComp?.buttons && buttonsComp.buttons.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {buttonsComp.buttons.map((button, index) => (
                  <span key={index} className="rounded-full border px-3 py-1 text-xs">
                    {button.text}
                    {button.url ? ` — ${renderText(button.url, samples)}` : ''}
                    {button.phoneNumber ? ` — ${button.phoneNumber}` : ''}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {varNames.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('templates.sampleVariables')}</p>
              {varNames.map((name, index) => (
                <div key={`${name}-${index}`} className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono" dir="ltr">
                    {name}
                  </Badge>
                  <Input
                    dir="ltr"
                    placeholder={`${t('templates.sampleValue')} ${index + 1}`}
                    value={samples[index] ?? ''}
                    onChange={(event) =>
                      setSamples((current) => {
                        const next = [...current];
                        next[index] = event.target.value;
                        return next;
                      })
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('templates.noVariables')}</p>
          )}

          {template.rejectionReason ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" dir="auto">
              {template.rejectionReason}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Create dialog ----------

interface ButtonDraft {
  type: CreateMessageTemplateButtonInput['type'];
  text: string;
  url: string;
  phoneNumber: string;
}

function CreateTemplateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const createMutation = useCreateTemplate();

  const [name, setName] = React.useState('');
  const [language, setLanguage] = React.useState('en_US');
  const [category, setCategory] = React.useState<TemplateCategory>('UTILITY');
  const [headerText, setHeaderText] = React.useState('');
  const [bodyText, setBodyText] = React.useState('');
  const [footerText, setFooterText] = React.useState('');
  const [buttons, setButtons] = React.useState<ButtonDraft[]>([]);
  const [sampleValues, setSampleValues] = React.useState<PreviewSampleValues>({});

  React.useEffect(() => {
    if (!open) {
      setName('');
      setLanguage('en_US');
      setCategory('UTILITY');
      setHeaderText('');
      setBodyText('');
      setFooterText('');
      setButtons([]);
    }
  }, [open]);

  const addButton = () => setButtons((current) => [...current, { type: 'QUICK_REPLY', text: '', url: '', phoneNumber: '' }]);

  const submit = async () => {
    if (!bodyText.trim()) {
      toast.error(t('templates.bodyRequired'));
      return;
    }
    if (!/^[a-z0-9_]+$/.test(name.trim())) {
      toast.error(t('templates.nameInvalid'));
      return;
    }

    const components: CreateMessageTemplateComponentInput[] = [];
    if (headerText.trim()) {
      components.push({ type: 'HEADER', headerFormat: 'TEXT', text: headerText.trim() });
    }
    components.push({ type: 'BODY', text: bodyText.trim() });
    if (footerText.trim()) {
      components.push({ type: 'FOOTER', text: footerText.trim() });
    }
    if (buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: buttons
          .filter((button) => button.text.trim().length > 0)
          .map((button) => {
            const built: CreateMessageTemplateButtonInput = { type: button.type, text: button.text.trim() };
            if (button.type === 'URL' && button.url.trim()) {
              built.url = button.url.trim();
            }
            if (button.type === 'PHONE_NUMBER' && button.phoneNumber.trim()) {
              built.phoneNumber = button.phoneNumber.trim();
            }
            return built;
          }),
      });
    }

    const input: CreateMessageTemplateInput = {
      name: name.trim(),
      language: language.trim(),
      category,
      components,
      samples: Object.keys(sampleValues)
        .map(Number)
        .sort((a, b) => a - b)
        .map((position) => sampleValues[position] ?? ''),
    };

    try {
      const result = await createMutation.mutateAsync(input);
      toast.success(t('templates.createSuccess', { name: result.name }));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('templates.createTitle')}</DialogTitle>
          <DialogDescription>{t('templates.createDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">{t('templates.name')}</Label>
              <Input
                id="tpl-name"
                dir="ltr"
                value={name}
                placeholder="order_confirmation"
                onChange={(event) => setName(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('templates.nameHint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-language">{t('templates.language')}</Label>
              <Input id="tpl-language" dir="ltr" value={language} placeholder="en_US" onChange={(event) => setLanguage(event.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-category">{t('common.category')}</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as TemplateCategory)}>
              <SelectTrigger id="tpl-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_CATEGORIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`templates.category.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-header">{t('templates.headerText')}</Label>
            <Input
              id="tpl-header"
              dir="ltr"
              value={headerText}
              placeholder={t('templates.headerPlaceholder')}
              onChange={(event) => setHeaderText(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-body">{t('templates.bodyText')}</Label>
            <Textarea
              id="tpl-body"
              dir="ltr"
              rows={4}
              value={bodyText}
              placeholder={t('templates.bodyPlaceholder')}
              onChange={(event) => setBodyText(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-footer">{t('templates.footerText')}</Label>
            <Input
              id="tpl-footer"
              dir="ltr"
              value={footerText}
              placeholder={t('templates.footerPlaceholder')}
              onChange={(event) => setFooterText(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('templates.buttons')}</Label>
              <Button type="button" variant="outline" size="sm" onClick={addButton}>
                <Plus className="h-4 w-4" />
                {t('templates.addButton')}
              </Button>
            </div>
            {buttons.map((button, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[140px_1fr_1fr_auto]">
                <Select
                  value={button.type}
                  onValueChange={(value) =>
                    setButtons((current) => {
                      const next = [...current];
                      next[index] = { ...next[index]!, type: value as ButtonDraft['type'] };
                      return next;
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QUICK_REPLY">{t('templates.buttonType.QUICK_REPLY')}</SelectItem>
                    <SelectItem value="URL">{t('templates.buttonType.URL')}</SelectItem>
                    <SelectItem value="PHONE_NUMBER">{t('templates.buttonType.PHONE_NUMBER')}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  dir="ltr"
                  placeholder={t('templates.buttonText')}
                  value={button.text}
                  onChange={(event) =>
                    setButtons((current) => {
                      const next = [...current];
                      next[index] = { ...next[index]!, text: event.target.value };
                      return next;
                    })
                  }
                />
                {button.type === 'URL' ? (
                  <Input
                    dir="ltr"
                    placeholder="https://example.com/{{1}}"
                    value={button.url}
                    onChange={(event) =>
                      setButtons((current) => {
                        const next = [...current];
                        next[index] = { ...next[index]!, url: event.target.value };
                        return next;
                      })
                    }
                  />
                ) : button.type === 'PHONE_NUMBER' ? (
                  <Input
                    dir="ltr"
                    placeholder="+1234567890"
                    value={button.phoneNumber}
                    onChange={(event) =>
                      setButtons((current) => {
                        const next = [...current];
                        next[index] = { ...next[index]!, phoneNumber: event.target.value };
                        return next;
                      })
                    }
                  />
                ) : (
                  <span />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setButtons((current) => current.filter((_, i) => i !== index))}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
          </div>
          <div className="lg:sticky lg:top-0 lg:self-start">
            <TemplateLivePreview
              language={language}
              headerText={headerText}
              bodyText={bodyText}
              footerText={footerText}
              buttons={buttons}
              sampleValues={sampleValues}
              onSampleChange={(values) => setSampleValues(values)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={createMutation.isPending}>
            {createMutation.isPending ? <Spinner size="sm" /> : null}
            {t('templates.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Panel ----------

export function TemplatesPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<TemplateStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = React.useState<TemplateCategory | ''>('');

  const query: MessageTemplateQuery = {
    page,
    pageSize,
    search: search.trim() || undefined,
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  };

  const { data, isLoading, isError, refetch, isFetching, error } = useMessageTemplates(query);
  const { data: syncStatus } = useTemplateSyncStatus();
  const syncMutation = useSyncTemplates();

  const notConfigured = isError && (error as ApiClientError | null)?.code === 'WHATSAPP_NOT_CONFIGURED';

  const [previewTemplate, setPreviewTemplate] = React.useState<MessageTemplateDto | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  const handleSync = async () => {
    try {
      const result = await syncMutation.mutateAsync();
      toast.success(
        t('templates.syncSuccess', {
          inserted: result.inserted,
          updated: result.updated,
          blocked: result.blockedTemplates.length,
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('templates.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {syncStatus?.lastSyncedAt
              ? t('templates.lastSynced', { time: formatDateTime(syncStatus.lastSyncedAt) })
              : t('templates.neverSynced')}
            {syncStatus ? ` · ${t('templates.approvedCount', { count: syncStatus.approvedCount })}` : ''}
          </p>
        </div>
        {canManage && !notConfigured ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void handleSync()} disabled={syncMutation.isPending}>
              {syncMutation.isPending ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
              {t('templates.sync')}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {t('templates.create')}
            </Button>
          </div>
        ) : null}
      </div>

      {syncStatus && syncStatus.blockedCount > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('templates.blockedTitle', { count: syncStatus.blockedCount })}</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-0.5 ps-4">
              {syncStatus.blockedTemplates.map((blocked) => (
                <li key={blocked.id} className="font-mono" dir="ltr">
                  {blocked.name} · {t(`templates.status.${blocked.status}`)}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="w-full sm:max-w-xs"
          placeholder={t('templates.searchPlaceholder')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as TemplateStatus | '');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('templates.statusFilter')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('common.all')}</SelectItem>
            {TEMPLATE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`templates.status.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={categoryFilter}
          onValueChange={(value) => {
            setCategoryFilter(value as TemplateCategory | '');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('templates.categoryFilter')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('common.all')}</SelectItem>
            {TEMPLATE_CATEGORIES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`templates.category.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {notConfigured ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={Plug}
            title={t('templates.notConfiguredTitle')}
            description={t('templates.notConfiguredDescription')}
          >
            <Link to="/whatsapp">
              <Button>
                <Plug className="h-4 w-4" />
                {t('templates.connectAccount')}
              </Button>
            </Link>
          </EmptyState>
        </div>
      ) : isError ? (
        <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void refetch()} loading={isFetching} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('templates.name')}</TableHead>
                <TableHead>{t('templates.language')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('common.category')}</TableHead>
                <TableHead>{t('templates.statusColumn')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('templates.updated')}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={6}>
                        <span className="block h-10 w-full animate-pulse rounded bg-muted" />
                      </TableCell>
                    </TableRow>
                  ))
                : data && data.items.length > 0
                  ? data.items.map((template) => (
                      <TableRow key={template.id} className="cursor-pointer" onClick={() => setPreviewTemplate(template)}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate font-mono text-sm" dir="ltr">
                              {template.name}
                            </span>
                            {template.blockedAt ? (
                              <Badge variant="destructive">{t('templates.blocked')}</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{template.language}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {t(`templates.category.${template.category}`)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[template.status]}>
                            {t(`templates.status.${template.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell text-sm">
                          {formatDateTime(template.updatedAt)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setPreviewTemplate(template)}>
                            {t('templates.preview')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow>
                        <TableCell colSpan={6} className="p-0">
                          <EmptyState
                            icon={FileText}
                            title={t('templates.noTemplates')}
                            description={t('templates.noTemplatesDescription')}
                          >
                            <EmptyStateHelpLink categorySlug="message-templates" slug="synchronizing-templates" />
                          </EmptyState>
                        </TableCell>
                      </TableRow>
                    )}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.totalPages > 0 ? (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">{t('common.showingXOfY', { count: data.items.length, total: data.total })}</p>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            onPageChange={setPage}
            labels={{
              firstPage: t('common.firstPage'),
              lastPage: t('common.lastPage'),
              prevPage: t('common.previousPage'),
              nextPage: t('common.nextPage'),
            }}
          />
        </div>
      ) : null}

      <TemplatePreviewDialog
        template={previewTemplate}
        open={previewTemplate !== null}
        onOpenChange={(open) => !open && setPreviewTemplate(null)}
      />
      <CreateTemplateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}