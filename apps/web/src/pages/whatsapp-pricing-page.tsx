import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  BUDGET_PERIOD_TYPES,
  BUDGET_SCOPE_TYPES,
  PRICING_BILLING_MODELS,
  PRICING_CATEGORIES,
  budgetPolicyCreateSchema,
  pricingRuleSetCreateSchema,
  type BudgetPolicyCreateInput,
  type BudgetPolicyDto,
  type BudgetUsage,
  type CostReconciliationJobDto,
  type ExportJobType,
  type PricingRuleInput,
  type PricingRuleSetCreateInput,
  type PricingRuleSetDto,
} from '@wa/shared';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Label,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@wa/ui';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Coins,
  Copy,
  Download,
  FileUp,
  MoreHorizontal,
  Play,
  ShieldAlert,
  Upload,
  Wallet,
} from 'lucide-react';

import { PageHeader } from '../components/page-header';
import { ContextualHelpButton } from '../features/help/help-drawer-provider';
import { formatDateTime, formatDate } from '../lib/format';
import { localizedZodResolver } from '../lib/validation';
import {
  useActivatePricingRuleSet,
  useArchivePricingRuleSet,
  useBudgetPolicies,
  useBudgetUsage,
  useCreateBudgetPolicy,
  useCreateCostExport,
  useCreatePricingRuleSet,
  useDisableBudgetPolicy,
  useDuplicatePricingRuleSet,
  useEnableBudgetPolicy,
  usePricingCoverage,
  usePricingImportCreate,
  usePricingImportPreview,
  usePricingRuleSets,
  useReconciliationApply,
  useReconciliationUnmatchedDownload,
  useReconciliationUpload,
  useReconciliationValidate,
  useReconciliations,
  useRoi,
  useValidatePricingRuleSet,
  useWhatsappCosts,
} from '../features/pricing/api';

const SECTIONS = ['overview', 'rule-sets', 'budgets', 'reconciliation'] as const;
type Section = (typeof SECTIONS)[number];

const RULE_SET_STATUS_BADGE: Record<PricingRuleSetDto['status'], 'default' | 'secondary' | 'outline' | 'warning' | 'success' | 'destructive' | 'muted'> = {
  DRAFT: 'secondary',
  ACTIVE: 'success',
  EXPIRED: 'muted',
  ARCHIVED: 'outline',
};

const BUDGET_STATUS_BADGE: Record<BudgetPolicyDto['status'], 'default' | 'secondary' | 'outline' | 'warning' | 'success' | 'destructive' | 'muted'> = {
  ACTIVE: 'success',
  DISABLED: 'secondary',
  EXPIRED: 'muted',
};

const RECONCILIATION_STATUS_BADGE: Record<
  CostReconciliationJobDto['status'],
  'default' | 'secondary' | 'outline' | 'warning' | 'success' | 'destructive' | 'muted'
> = {
  UPLOADED: 'outline',
  VALIDATING: 'warning',
  READY: 'secondary',
  PROCESSING: 'warning',
  COMPLETED: 'success',
  FAILED: 'destructive',
};

const USAGE_STATUS_BADGE: Record<BudgetUsage['status'], 'default' | 'secondary' | 'outline' | 'warning' | 'success' | 'destructive' | 'muted'> = {
  OK: 'success',
  WARNING: 'warning',
  CRITICAL: 'destructive',
  BLOCKED: 'destructive',
};

const RECONCILIATION_IN_PROGRESS = ['VALIDATING', 'PROCESSING'] as const;

function formatMoney(value: number | null | undefined, currency?: string | null): string {
  if (value === null || value === undefined) {
    return '—';
  }
  const code = currency ?? 'USD';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${code}`.trim();
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function WhatsAppPricingPage() {
  const { t } = useTranslation();
  const [section, setSection] = React.useState<Section>('overview');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pricing.title')}
        description={t('pricing.description')}
        actions={<ContextualHelpButton featureKey="whatsapp-pricing" />}
      />
      <div className="flex w-full max-w-xl flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {SECTIONS.map((key) => (
          <Button
            key={key}
            variant={section === key ? 'default' : 'ghost'}
            size="sm"
            className="flex-1"
            onClick={() => setSection(key)}
          >
            {t(`pricing.section.${key}`)}
          </Button>
        ))}
      </div>
      {section === 'overview' ? <OverviewSection /> : null}
      {section === 'rule-sets' ? <RuleSetsSection /> : null}
      {section === 'budgets' ? <BudgetsSection /> : null}
      {section === 'reconciliation' ? <ReconciliationSection /> : null}
    </div>
  );
}

// ---------- Overview ----------

function OverviewSection() {
  const { t } = useTranslation();
  const [from, setFrom] = React.useState<string>('');
  const [to, setTo] = React.useState<string>('');

  const coverage = usePricingCoverage();
  const costs = useWhatsappCosts({ from: from || undefined, to: to || undefined });
  const roi = useRoi({ from: from || undefined, to: to || undefined });

  const [exportType, setExportType] = React.useState<ExportJobType | null>(null);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              {t('pricing.overview.coverageTitle')}
            </CardTitle>
            <CardDescription>{t('pricing.overview.coverageDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {coverage.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : coverage.isError || !coverage.data ? (
              <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void coverage.refetch()} />
            ) : (
              <>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">{t('pricing.overview.activeRuleSet')}</p>
                  {coverage.data.activeRuleSetId ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="font-medium">{coverage.data.activeRuleSetName}</p>
                      <Badge variant="success">v{coverage.data.activeVersion}</Badge>
                      <Badge variant="secondary" dir="ltr">
                        {coverage.data.activeCurrency}
                      </Badge>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-destructive">{t('pricing.overview.noActiveRuleSet')}</p>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{t('pricing.overview.totalRules')}</dt>
                    <dd className="font-medium">{coverage.data.totalRules}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('pricing.overview.marketsCovered')}</dt>
                    <dd className="font-medium">{coverage.data.marketsCovered.length}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('pricing.overview.freeEntryPointRules')}</dt>
                    <dd className="font-medium">{coverage.data.freeEntryPointRules}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('pricing.overview.perMessageRules')}</dt>
                    <dd className="font-medium">{coverage.data.perMessageRules}</dd>
                  </div>
                </dl>
                {coverage.data.missingMarkets.length > 0 ? (
                  <Alert variant="warning">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{t('pricing.overview.missingMarkets')}</AlertTitle>
                    <AlertDescription dir="ltr" className="text-xs">
                      {coverage.data.missingMarkets.join(', ')}
                    </AlertDescription>
                  </Alert>
                ) : null}
                {coverage.data.conflicts.length > 0 ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{t('pricing.overview.conflicts')}</AlertTitle>
                    <AlertDescription className="text-xs">
                      {coverage.data.conflicts.map((conflict) => conflict.message).join(' · ')}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('pricing.overview.conflictsNone')}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-4 w-4 text-muted-foreground" />
              {t('pricing.overview.costReportTitle')}
            </CardTitle>
            <CardDescription>{t('pricing.overview.costReportDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid w-full gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cost-from">{t('pricing.overview.from')}</Label>
                  <Input id="cost-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cost-to">{t('pricing.overview.to')}</Label>
                  <Input id="cost-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                </div>
              </div>
            </div>
            {costs.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : costs.isError || !costs.data ? (
              <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void costs.refetch()} />
            ) : (
              <>
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('pricing.overview.currency')}</TableHead>
                        <TableHead className="text-end">{t('pricing.overview.estimatedCost')}</TableHead>
                        <TableHead className="text-end">{t('pricing.overview.finalCost')}</TableHead>
                        <TableHead className="text-end">{t('pricing.overview.outboundMessages')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {costs.data.currencyTotals.map((row) => (
                        <TableRow key={row.currency}>
                          <TableCell className="font-medium" dir="ltr">
                            {row.currency}
                          </TableCell>
                          <TableCell className="text-end">{formatMoney(row.estimatedCost, row.currency)}</TableCell>
                          <TableCell className="text-end">{formatMoney(row.finalCost, row.currency)}</TableCell>
                          <TableCell className="text-end">{row.outboundMessages}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {t('pricing.overview.metrics.costPerDelivered')}:{' '}
                    <span className="font-medium">{formatMoney(costs.data.costPerDeliveredMessage)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {t('pricing.overview.metrics.costPerRead')}:{' '}
                    <span className="font-medium">{formatMoney(costs.data.costPerReadMessage)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {t('pricing.overview.metrics.costPerReply')}:{' '}
                    <span className="font-medium">{formatMoney(costs.data.costPerReply)}</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setExportType('whatsapp-costs')}>
                    <Download className="h-4 w-4" />
                    {t('pricing.overview.exportCosts')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setExportType('conversation-costs')}>
                    <Download className="h-4 w-4" />
                    {t('pricing.overview.exportConversations')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setExportType('agent-costs')}>
                    <Download className="h-4 w-4" />
                    {t('pricing.overview.exportAgents')}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            {t('pricing.overview.roiTitle')}
          </CardTitle>
          <CardDescription>{t('pricing.overview.roiDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {roi.isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : roi.isError || !roi.data ? (
            <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void roi.refetch()} />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="text-muted-foreground">
                  {t('pricing.overview.metrics.costPerQualifiedLead')}:{' '}
                  <span className="font-medium">{formatMoney(roi.data.costPerQualifiedLead)}</span>
                </span>
                <span className="text-muted-foreground">
                  {t('pricing.overview.metrics.costPerSale')}:{' '}
                  <span className="font-medium">{formatMoney(roi.data.costPerSale)}</span>
                </span>
              </div>
              {roi.data.totals.length > 0 ? (
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('pricing.overview.currency')}</TableHead>
                        <TableHead className="text-end">{t('pricing.overview.revenue')}</TableHead>
                        <TableHead className="text-end">{t('pricing.overview.cost')}</TableHead>
                        <TableHead className="text-end">{t('pricing.overview.margin')}</TableHead>
                        <TableHead className="text-end">{t('pricing.overview.roi')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roi.data.totals.map((row) => (
                        <TableRow key={row.currency}>
                          <TableCell className="font-medium" dir="ltr">
                            {row.currency}
                          </TableCell>
                          <TableCell className="text-end">{formatMoney(row.revenue, row.currency)}</TableCell>
                          <TableCell className="text-end">{formatMoney(row.cost, row.currency)}</TableCell>
                          <TableCell className="text-end">{formatMoney(row.contributionMargin, row.currency)}</TableCell>
                          <TableCell className="text-end">
                            {row.roi === null ? '—' : `${(row.roi * 100).toFixed(1)}%`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  icon={BarChart3}
                  title={t('pricing.overview.noRoi')}
                  description={t('pricing.overview.noRoiDescription')}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {exportType ? (
        <ExportDialog type={exportType} open={exportType !== null} onOpenChange={(open) => !open && setExportType(null)} />
      ) : null}
    </div>
  );
}

function ExportDialog({
  type,
  open,
  onOpenChange,
}: {
  type: ExportJobType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [from, setFrom] = React.useState<string>('');
  const [to, setTo] = React.useState<string>('');
  const createExport = useCreateCostExport();

  const handleSubmit = async () => {
    try {
      await createExport.mutateAsync({
        type,
        filters: { from: from || undefined, to: to || undefined },
      });
      toast.success(t('pricing.overview.exportQueued'));
      setFrom('');
      setTo('');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('pricing.overview.exportTitle')}</DialogTitle>
          <DialogDescription>{t('pricing.overview.exportDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="export-from">{t('pricing.overview.from')}</Label>
            <Input id="export-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="export-to">{t('pricing.overview.to')}</Label>
            <Input id="export-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={createExport.isPending}>
            {createExport.isPending ? <Spinner size="sm" /> : <Download className="h-4 w-4" />}
            {t('pricing.overview.export')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Rule sets ----------

function RuleSetsSection() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = React.useState<string>('');
  const { data, isLoading, isError, refetch, isFetching } = usePricingRuleSets({
    status: (statusFilter || undefined) as PricingRuleSetDto['status'] | undefined,
  });

  const [createOpen, setCreateOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);

  const duplicate = useDuplicatePricingRuleSet();
  const validate = useValidatePricingRuleSet();
  const activate = useActivatePricingRuleSet();
  const archive = useArchivePricingRuleSet();

  const [confirmArchive, setConfirmArchive] = React.useState<PricingRuleSetDto | null>(null);

  const runAction = async (label: string, mutation: ReturnType<typeof useArchivePricingRuleSet>, id: string) => {
    try {
      await mutation.mutateAsync(id);
      toast.success(label);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('pricing.rules.description')}</p>
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value === 'ALL' ? '' : value)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('common.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('common.all')}</SelectItem>
              {(['DRAFT', 'ACTIVE', 'EXPIRED', 'ARCHIVED'] as const).map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`pricing.status.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            {t('pricing.rules.import')}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Coins className="h-4 w-4" />
            {t('pricing.rules.create')}
          </Button>
        </div>
      </div>

      {isError ? (
        <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void refetch()} loading={isFetching} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('pricing.rules.name')}</TableHead>
                <TableHead>{t('pricing.rules.currency')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('pricing.rules.version')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('pricing.rules.effectiveDates')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('pricing.rules.rules')}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : data && data.items.length > 0
                  ? data.items.map((ruleSet) => (
                      <TableRow key={ruleSet.id}>
                        <TableCell>
                          <p className="font-medium">{ruleSet.name}</p>
                          <p className="text-xs text-muted-foreground">{ruleSet.provider}</p>
                        </TableCell>
                        <TableCell dir="ltr">{ruleSet.currency}</TableCell>
                        <TableCell>
                          <Badge variant={RULE_SET_STATUS_BADGE[ruleSet.status]}>
                            {t(`pricing.status.${ruleSet.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>v{ruleSet.version}</TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                          {formatDate(ruleSet.effectiveFrom)}
                          {ruleSet.effectiveTo ? ` → ${formatDate(ruleSet.effectiveTo)}` : ''}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">{ruleSet.rules.length}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={t('common.actions')}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem
                                onClick={() => void runAction(t('pricing.rules.duplicateSuccess'), duplicate, ruleSet.id)}
                              >
                                <Copy className="h-4 w-4" />
                                {t('pricing.rules.duplicate')}
                              </DropdownMenuItem>
                              {ruleSet.status === 'DRAFT' || ruleSet.status === 'EXPIRED' ? (
                                <DropdownMenuItem
                                  onClick={() => void runAction(t('pricing.rules.validateSuccess'), validate, ruleSet.id)}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  {t('pricing.rules.validate')}
                                </DropdownMenuItem>
                              ) : null}
                              {ruleSet.status === 'DRAFT' ? (
                                <DropdownMenuItem
                                  onClick={() => void runAction(t('pricing.rules.activateSuccess'), activate, ruleSet.id)}
                                >
                                  <Play className="h-4 w-4" />
                                  {t('pricing.rules.activate')}
                                </DropdownMenuItem>
                              ) : null}
                              {ruleSet.status === 'ACTIVE' ? (
                                <DropdownMenuItem
                                  onClick={() => setConfirmArchive(ruleSet)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Wallet className="h-4 w-4" />
                                  {t('pricing.rules.archive')}
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow>
                        <TableCell colSpan={7} className="p-0">
                          <EmptyState icon={Coins} title={t('pricing.rules.noRuleSets')} description={t('pricing.rules.noRuleSetsDescription')} />
                        </TableCell>
                      </TableRow>
                    )}
            </TableBody>
          </Table>
        </div>
      )}

      <RuleSetCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RuleSetImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <AlertDialog open={confirmArchive !== null} onOpenChange={(open) => !open && setConfirmArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pricing.rules.archiveTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('pricing.rules.archiveDescription', { name: confirmArchive?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmArchive && void runAction(t('pricing.rules.archiveSuccess'), archive, confirmArchive.id)}
              disabled={archive.isPending}
            >
              {archive.isPending ? <Spinner size="sm" /> : null}
              {t('pricing.rules.archive')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type RuleSetFormValues = PricingRuleSetCreateInput;

function RuleSetCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const create = useCreatePricingRuleSet();

  const defaultRule: PricingRuleInput = {
    marketCode: '',
    countryCode: '',
    messageCategory: 'MARKETING',
    messageType: '*',
    billingModel: 'PER_MESSAGE',
    unitPrice: 0,
    effectiveFrom: today(),
    customerServiceWindowRequired: false,
    freeEntryPointEligible: false,
  };

  const form = useForm<RuleSetFormValues>({
    resolver: localizedZodResolver(pricingRuleSetCreateSchema, t),
    defaultValues: {
      name: '',
      provider: 'Meta',
      currency: 'USD',
      effectiveFrom: today(),
      sourceType: 'MANUAL',
      rules: [defaultRule],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'rules' });

  const handleSubmit = async (values: RuleSetFormValues) => {
    try {
      await create.mutateAsync(values);
      toast.success(t('pricing.rules.createSuccess'));
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('pricing.rules.createTitle')}</DialogTitle>
          <DialogDescription>{t('pricing.rules.createDescription')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pricing.rules.name')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pricing.rules.provider')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pricing.rules.currency')}</FormLabel>
                    <FormControl>
                      <Input {...field} dir="ltr" maxLength={3} className="uppercase" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="effectiveFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pricing.rules.effectiveFrom')}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{t('pricing.rules.rules')}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ ...defaultRule })}
                >
                  {t('common.add')}
                </Button>
              </div>
              {fields.map((field, index) => (
                <div key={field.id} className="rounded-lg border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium">{t('pricing.rules.rule')} {index + 1}</p>
                    {fields.length > 1 ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                        {t('common.remove')}
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <FormField
                      control={form.control}
                      name={`rules.${index}.marketCode`}
                      render={({ field: sub }) => (
                        <FormItem>
                          <FormLabel>{t('pricing.rules.marketCode')}</FormLabel>
                          <FormControl>
                            <Input {...sub} dir="ltr" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`rules.${index}.countryCode`}
                      render={({ field: sub }) => (
                        <FormItem>
                          <FormLabel>{t('pricing.rules.countryCode')}</FormLabel>
                          <FormControl>
                            <Input {...sub} dir="ltr" maxLength={2} className="uppercase" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`rules.${index}.messageCategory`}
                      render={({ field: sub }) => (
                        <FormItem>
                          <FormLabel>{t('pricing.rules.category')}</FormLabel>
                          <FormControl>
                            <Select value={sub.value} onValueChange={sub.onChange}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PRICING_CATEGORIES.map((category) => (
                                  <SelectItem key={category} value={category}>
                                    {t(`pricing.category.${category}`)}
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
                      control={form.control}
                      name={`rules.${index}.billingModel`}
                      render={({ field: sub }) => (
                        <FormItem>
                          <FormLabel>{t('pricing.rules.billingModel')}</FormLabel>
                          <FormControl>
                            <Select value={sub.value} onValueChange={sub.onChange}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PRICING_BILLING_MODELS.map((model) => (
                                  <SelectItem key={model} value={model}>
                                    {t(`pricing.billingModel.${model}`)}
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
                      control={form.control}
                      name={`rules.${index}.unitPrice`}
                      render={({ field: sub }) => (
                        <FormItem>
                          <FormLabel>{t('pricing.rules.unitPrice')}</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} step="0.0001" {...sub} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`rules.${index}.effectiveFrom`}
                      render={({ field: sub }) => (
                        <FormItem>
                          <FormLabel>{t('pricing.rules.effectiveFrom')}</FormLabel>
                          <FormControl>
                            <Input type="date" {...sub} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? <Spinner size="sm" /> : null}
                {t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function RuleSetImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const [file, setFile] = React.useState<File | null>(null);
  const preview = usePricingImportPreview();
  const create = usePricingImportCreate();

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      preview.reset();
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    if (next) {
      preview.mutate(next);
    }
  };

  const handleImport = async () => {
    if (!file) {
      return;
    }
    try {
      await create.mutateAsync(file);
      toast.success(t('pricing.rules.importSuccess'));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('pricing.rules.importTitle')}</DialogTitle>
          <DialogDescription>{t('pricing.rules.importDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Input type="file" accept=".csv,text/csv" onChange={(event) => void handleFile(event)} />
          </div>
          {preview.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner size="sm" />
              {t('common.loading')}
            </div>
          ) : preview.isError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t('common.error')}</AlertTitle>
              <AlertDescription>{preview.error instanceof Error ? preview.error.message : String(preview.error)}</AlertDescription>
            </Alert>
          ) : preview.data ? (
            <>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="text-muted-foreground">
                  {t('pricing.rules.importTotal')}: <span className="font-medium">{preview.data.totalRows}</span>
                </span>
                <span className="text-muted-foreground">
                  {t('pricing.rules.importValid')}: <span className="font-medium">{preview.data.validRows}</span>
                </span>
                <span className="text-muted-foreground">
                  {t('pricing.rules.importInvalid')}: <span className="font-medium">{preview.data.invalidRows}</span>
                </span>
                {preview.data.detectedCurrency ? (
                  <span className="text-muted-foreground" dir="ltr">
                    {t('pricing.rules.importCurrency')}: <span className="font-medium">{preview.data.detectedCurrency}</span>
                  </span>
                ) : null}
              </div>
              {preview.data.errors.length > 0 ? (
                <Alert variant="warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{t('pricing.rules.importErrors')}</AlertTitle>
                  <AlertDescription className="max-h-32 space-y-1 overflow-y-auto text-xs">
                    {preview.data.errors.map((error, index) => (
                      <p key={index}>
                        #{error.rowNumber}: {error.error}
                      </p>
                    ))}
                  </AlertDescription>
                </Alert>
              ) : null}
              {preview.data.overlappingRuleSets.length > 0 ? (
                <Alert variant="warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{t('pricing.rules.importOverlap')}</AlertTitle>
                </Alert>
              ) : null}
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleImport()} disabled={!file || create.isPending || (preview.data?.validRows ?? 0) === 0}>
            {create.isPending ? <Spinner size="sm" /> : <Upload className="h-4 w-4" />}
            {t('pricing.rules.import')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Budgets ----------

function BudgetsSection() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isFetching } = useBudgetPolicies({});

  const [createOpen, setCreateOpen] = React.useState(false);
  const [usagePolicy, setUsagePolicy] = React.useState<BudgetPolicyDto | null>(null);

  const disable = useDisableBudgetPolicy();
  const enable = useEnableBudgetPolicy();

  const toggleStatus = async (policy: BudgetPolicyDto) => {
    try {
      if (policy.status === 'ACTIVE') {
        await disable.mutateAsync(policy.id);
        toast.success(t('pricing.budgets.disableSuccess'));
      } else if (policy.status === 'DISABLED') {
        await enable.mutateAsync(policy.id);
        toast.success(t('pricing.budgets.enableSuccess'));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('pricing.budgets.description')}</p>
        <Button onClick={() => setCreateOpen(true)}>
          <Wallet className="h-4 w-4" />
          {t('pricing.budgets.create')}
        </Button>
      </div>

      {isError ? (
        <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void refetch()} loading={isFetching} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('pricing.budgets.name')}</TableHead>
                <TableHead>{t('pricing.budgets.scope')}</TableHead>
                <TableHead>{t('pricing.budgets.period')}</TableHead>
                <TableHead>{t('pricing.budgets.limit')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('pricing.budgets.effectiveDates')}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : data && data.items.length > 0
                  ? data.items.map((policy) => (
                      <TableRow key={policy.id}>
                        <TableCell>
                          <p className="font-medium">{policy.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t(`pricing.budgets.warningShort`, { value: policy.warningThresholdPercentage })}
                            {' · '}
                            {t(`pricing.budgets.criticalShort`, { value: policy.criticalThresholdPercentage })}
                          </p>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{t(`pricing.budgets.scopeType.${policy.scopeType}`)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{t(`pricing.budgets.periodType.${policy.periodType}`)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium" dir="ltr">
                            {formatMoney(policy.amountLimit, policy.currency)}
                          </span>
                          <span className="ms-1 text-xs text-muted-foreground" dir="ltr">
                            {policy.currency}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={BUDGET_STATUS_BADGE[policy.status]}>{t(`pricing.status.${policy.status}`)}</Badge>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                          {formatDate(policy.effectiveFrom)}
                          {policy.effectiveTo ? ` → ${formatDate(policy.effectiveTo)}` : ''}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={t('common.actions')}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem onClick={() => setUsagePolicy(policy)}>
                                <BarChart3 className="h-4 w-4" />
                                {t('pricing.budgets.usage')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={policy.status === 'EXPIRED'}
                                onClick={() => void toggleStatus(policy)}
                              >
                                {policy.status === 'ACTIVE' ? (
                                  <>
                                    <ShieldAlert className="h-4 w-4" />
                                    {t('pricing.budgets.disable')}
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-4 w-4" />
                                    {t('pricing.budgets.enable')}
                                  </>
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow>
                        <TableCell colSpan={7} className="p-0">
                          <EmptyState icon={Wallet} title={t('pricing.budgets.noBudgets')} description={t('pricing.budgets.noBudgetsDescription')} />
                        </TableCell>
                      </TableRow>
                    )}
            </TableBody>
          </Table>
        </div>
      )}

      <BudgetCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      {usagePolicy ? <BudgetUsageDialog policy={usagePolicy} onOpenChange={(open) => !open && setUsagePolicy(null)} /> : null}
    </div>
  );
}

function BudgetUsageDialog({ policy, onOpenChange }: { policy: BudgetPolicyDto; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const usage = useBudgetUsage(policy.id);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('pricing.budgets.usageTitle')}</DialogTitle>
          <DialogDescription>{policy.name}</DialogDescription>
        </DialogHeader>
        {usage.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : usage.isError || !usage.data ? (
          <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void usage.refetch()} />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant={USAGE_STATUS_BADGE[usage.data.status]}>{t(`pricing.budgets.usageStatus.${usage.data.status}`)}</Badge>
              <span className="text-sm text-muted-foreground">{t('pricing.budgets.usageCalculatedAt')} {formatDateTime(usage.data.calculatedAt)}</span>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('pricing.budgets.usagePercent')}</span>
                <span className="font-medium">{usage.data.usagePercentage.toFixed(1)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${usage.data.status === 'OK' ? 'bg-success' : usage.data.status === 'WARNING' ? 'bg-warning' : 'bg-destructive'}`}
                  style={{ width: `${Math.min(100, usage.data.usagePercentage)}%` }}
                />
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">{t('pricing.budgets.amountLimit')}</dt>
                <dd className="font-medium" dir="ltr">
                  {formatMoney(usage.data.amountLimit, usage.data.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('pricing.budgets.totalUsage')}</dt>
                <dd className="font-medium" dir="ltr">
                  {formatMoney(usage.data.totalUsage, usage.data.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('pricing.budgets.estimatedUsage')}</dt>
                <dd className="font-medium" dir="ltr">
                  {formatMoney(usage.data.estimatedUsage, usage.data.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('pricing.budgets.confirmedUsage')}</dt>
                <dd className="font-medium" dir="ltr">
                  {formatMoney(usage.data.confirmedUsage, usage.data.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('pricing.budgets.adjustedUsage')}</dt>
                <dd className="font-medium" dir="ltr">
                  {formatMoney(usage.data.adjustedUsage, usage.data.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('pricing.budgets.remaining')}</dt>
                <dd className="font-medium" dir="ltr">
                  {formatMoney(usage.data.remainingAmount, usage.data.currency)}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              {formatDate(usage.data.periodStart)}
              {usage.data.periodEnd ? ` → ${formatDate(usage.data.periodEnd)}` : ''}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type BudgetFormValues = BudgetPolicyCreateInput;

function BudgetCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const create = useCreateBudgetPolicy();

  const form = useForm<BudgetFormValues>({
    resolver: localizedZodResolver(budgetPolicyCreateSchema, t),
    defaultValues: {
      name: '',
      scopeType: 'GLOBAL',
      currency: 'EGP',
      periodType: 'MONTHLY',
      amountLimit: undefined,
      warningThresholdPercentage: 70,
      criticalThresholdPercentage: 90,
      hardStopEnabled: true,
      allowAdminOverride: true,
      effectiveFrom: today(),
    },
  });

  const handleSubmit = async (values: BudgetFormValues) => {
    try {
      await create.mutateAsync(values);
      toast.success(t('pricing.budgets.createSuccess'));
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('pricing.budgets.createTitle')}</DialogTitle>
          <DialogDescription>{t('pricing.budgets.createDescription')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pricing.budgets.name')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="scopeType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pricing.budgets.scope')}</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BUDGET_SCOPE_TYPES.map((scope) => (
                            <SelectItem key={scope} value={scope}>
                              {t(`pricing.budgets.scopeType.${scope}`)}
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
                control={form.control}
                name="periodType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pricing.budgets.period')}</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BUDGET_PERIOD_TYPES.map((period) => (
                            <SelectItem key={period} value={period}>
                              {t(`pricing.budgets.periodType.${period}`)}
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
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pricing.budgets.currency')}</FormLabel>
                    <FormControl>
                      <Input {...field} dir="ltr" maxLength={3} className="uppercase" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amountLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pricing.budgets.limit')}</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.01" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="warningThresholdPercentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pricing.budgets.warningThreshold')}</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="criticalThresholdPercentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pricing.budgets.criticalThreshold')}</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hardStopEnabled"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pricing.budgets.hardStop')}</FormLabel>
                    <FormControl>
                      <Select value={String(field.value)} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">{t('common.yes')}</SelectItem>
                          <SelectItem value="false">{t('common.no')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="allowAdminOverride"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pricing.budgets.adminOverride')}</FormLabel>
                    <FormControl>
                      <Select value={String(field.value)} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">{t('common.yes')}</SelectItem>
                          <SelectItem value="false">{t('common.no')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="effectiveFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pricing.budgets.effectiveFrom')}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? <Spinner size="sm" /> : null}
                {t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Reconciliation ----------

function ReconciliationSection() {
  const { t } = useTranslation();
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const { data, isLoading, isError, refetch, isFetching } = useReconciliations({ page, pageSize });

  const upload = useReconciliationUpload();
  const validate = useReconciliationValidate();
  const apply = useReconciliationApply();
  const downloadUnmatched = useReconciliationUnmatchedDownload();

  const [applyJob, setApplyJob] = React.useState<CostReconciliationJobDto | null>(null);

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    void upload
      .mutateAsync(file)
      .then(() => toast.success(t('pricing.reconciliation.uploadSuccess')))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : String(error)));
    event.target.value = '';
  };

  const handleValidate = async (job: CostReconciliationJobDto) => {
    try {
      const result = await validate.mutateAsync(job.id);
      toast.success(
        t('pricing.reconciliation.validateSuccess', {
          matched: result.matchedRows,
          unmatched: result.unmatchedRows,
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleApply = async () => {
    if (!applyJob) {
      return;
    }
    try {
      await apply.mutateAsync(applyJob.id);
      toast.success(t('pricing.reconciliation.applySuccess'));
      setApplyJob(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleDownloadUnmatched = async (job: CostReconciliationJobDto) => {
    try {
      const blob = await downloadUnmatched.mutateAsync(job.id);
      downloadBlob(blob, `reconciliation-${job.id}-unmatched.csv`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileUp className="h-4 w-4 text-muted-foreground" />
            {t('pricing.reconciliation.uploadTitle')}
          </CardTitle>
          <CardDescription>{t('pricing.reconciliation.uploadDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Input type="file" accept=".csv,text/csv" onChange={(event) => void handleUpload(event)} disabled={upload.isPending} />
            {upload.isPending ? (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner size="sm" />
                {t('common.loading')}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">{t('pricing.reconciliation.description')}</p>

      {isError ? (
        <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void refetch()} loading={isFetching} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('pricing.reconciliation.file')}</TableHead>
                <TableHead>{t('pricing.reconciliation.period')}</TableHead>
                <TableHead>{t('pricing.reconciliation.currency')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('pricing.reconciliation.rows')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('pricing.reconciliation.createdAt')}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : data && data.items.length > 0
                  ? data.items.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>
                          <p className="max-w-56 truncate font-medium" dir="ltr">
                            {job.originalFilename ?? job.id}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {job.periodStart ? formatDate(job.periodStart) : '—'}
                          {job.periodEnd ? ` → ${formatDate(job.periodEnd)}` : ''}
                        </TableCell>
                        <TableCell dir="ltr">{job.currency ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={RECONCILIATION_STATUS_BADGE[job.status]}>
                            {RECONCILIATION_IN_PROGRESS.includes(job.status as (typeof RECONCILIATION_IN_PROGRESS)[number]) ? (
                              <Spinner size="sm" className="me-1" />
                            ) : null}
                            {t(`pricing.status.${job.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {t('pricing.reconciliation.total')} {job.totalRows} · {t('pricing.reconciliation.matched')} {job.matchedRows} ·{' '}
                            {t('pricing.reconciliation.unmatched')} {job.unmatchedRows} · {t('pricing.reconciliation.adjusted')} {job.adjustedRows}
                          </span>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                          {formatDateTime(job.createdAt)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={t('common.actions')}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              {job.status === 'UPLOADED' ? (
                                <DropdownMenuItem onClick={() => void handleValidate(job)}>
                                  <CheckCircle2 className="h-4 w-4" />
                                  {t('pricing.reconciliation.validate')}
                                </DropdownMenuItem>
                              ) : null}
                              {job.status === 'READY' ? (
                                <DropdownMenuItem onClick={() => setApplyJob(job)}>
                                  <Play className="h-4 w-4" />
                                  {t('pricing.reconciliation.apply')}
                                </DropdownMenuItem>
                              ) : null}
                              {job.unmatchedRows > 0 && (job.status === 'READY' || job.status === 'COMPLETED') ? (
                                <DropdownMenuItem onClick={() => void handleDownloadUnmatched(job)}>
                                  <Download className="h-4 w-4" />
                                  {t('pricing.reconciliation.downloadUnmatched')}
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow>
                        <TableCell colSpan={7} className="p-0">
                          <EmptyState icon={FileUp} title={t('pricing.reconciliation.noJobs')} description={t('pricing.reconciliation.noJobsDescription')} />
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

      <AlertDialog open={applyJob !== null} onOpenChange={(open) => !open && setApplyJob(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pricing.reconciliation.applyTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('pricing.reconciliation.applyDescription', { file: applyJob?.originalFilename ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={apply.isPending}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleApply()} disabled={apply.isPending}>
              {apply.isPending ? <Spinner size="sm" /> : null}
              {t('pricing.reconciliation.apply')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
