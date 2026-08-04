import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { IMPORT_JOB_STATUSES, type ImportJobDto, type ImportJobStatus } from '@wa/shared';
import {
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
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
import { Download, FileUp, MoreHorizontal, Table2, Trash2 } from 'lucide-react';

import { PageHeader } from '../components/page-header';
import { ContextualHelpButton } from '../features/help/help-drawer-provider';
import { formatDateTime } from '../lib/format';
import { useDeleteImport, useImportJobs, useImportRejectedCsv } from '../features/imports/api';
import { ImportWizardDialog } from '../features/imports/import-wizard-dialog';
import { ImportDetailDialog } from '../features/imports/import-detail-dialog';

const STATUS_BADGE: Record<
  ImportJobStatus,
  'default' | 'secondary' | 'outline' | 'warning' | 'success' | 'destructive' | 'muted'
> = {
  UPLOADED: 'outline',
  CONFIGURED: 'secondary',
  VALIDATING: 'warning',
  PROCESSING: 'warning',
  COMPLETED: 'success',
  FAILED: 'destructive',
  CANCELLED: 'muted',
};

const IN_PROGRESS: ImportJobStatus[] = ['VALIDATING', 'PROCESSING'];

export function ImportsPage() {
  const { t } = useTranslation();
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const [statusFilter, setStatusFilter] = React.useState<ImportJobStatus | ''>('');

  const { data, isLoading, isError, refetch, isFetching } = useImportJobs({
    page,
    pageSize,
    status: statusFilter || undefined,
  });

  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [detailJob, setDetailJob] = React.useState<ImportJobDto | null>(null);
  const [deleteJob, setDeleteJob] = React.useState<ImportJobDto | null>(null);
  const rejectedMutation = useImportRejectedCsv();
  const deleteMutation = useDeleteImport();

  const jobs = data;

  const handleDelete = async () => {
    if (!deleteJob) {
      return;
    }
    try {
      const result = await deleteMutation.mutateAsync(deleteJob.id);
      toast.success(t('imports.deleted', { count: result.deletedContacts }));
      setDeleteJob(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleDownloadRejected = async (job: ImportJobDto) => {
    try {
      const blob = await rejectedMutation.mutateAsync(job.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${job.originalFilename.replace(/\.[^.]+$/, '')}.rejected.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('imports.title')}
        description={t('imports.description')}
        actions={
          <div className="flex items-center gap-2">
            <ContextualHelpButton featureKey="imports" />
            <Button onClick={() => setWizardOpen(true)}>
              <FileUp className="h-4 w-4" />
              {t('imports.upload')}
            </Button>
          </div>
        }
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('imports.manageDescription')}</p>
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as ImportJobStatus | '');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('imports.statusFilter')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('common.all')}</SelectItem>
            {IMPORT_JOB_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`imports.status.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void refetch()} loading={isFetching} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('imports.file')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('imports.totalRows')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('imports.results')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('imports.createdAt')}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : jobs && jobs.items.length > 0
                  ? jobs.items.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-2">
                            <Table2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="truncate font-medium" dir="ltr">
                                {job.originalFilename}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {job.fileType.toUpperCase()} · {job.createdByUserId.slice(0, 8)}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[job.status]}>
                            {IN_PROGRESS.includes(job.status) ? <Spinner size="sm" className="me-1" /> : null}
                            {t(`imports.status.${job.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>{job.totalRows}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>{t('imports.validShort')} {job.validRows}</span>
                            <span>{t('imports.invalidShort')} {job.invalidRows}</span>
                            <span>{t('imports.createdShort')} {job.createdRows}</span>
                            <span>{t('imports.updatedShort')} {job.updatedRows}</span>
                            <span>{t('imports.duplicateShort')} {job.duplicateRows}</span>
                            <span>{t('imports.skippedShort')} {job.skippedRows}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">{formatDateTime(job.createdAt)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={t('common.actions')}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem onClick={() => setDetailJob(job)}>{t('imports.viewRows')}</DropdownMenuItem>
                              {job.hasRejectedRows ? (
                                <DropdownMenuItem onClick={() => void handleDownloadRejected(job)} disabled={rejectedMutation.isPending}>
                                  <Download className="h-4 w-4" />
                                  {t('imports.downloadRejected')}
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                disabled={job.status === 'VALIDATING' || job.status === 'PROCESSING'}
                                onClick={() => setDeleteJob(job)}
                              >
                                <Trash2 className="h-4 w-4" />
                                {t('imports.delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow>
                        <TableCell colSpan={6} className="p-0">
                          <EmptyState icon={FileUp} title={t('imports.noImports')} description={t('imports.noImportsDescription')} />
                        </TableCell>
                      </TableRow>
                    )}
            </TableBody>
          </Table>
        </div>
      )}

      {jobs && jobs.totalPages > 0 ? (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">{t('common.showingXOfY', { count: jobs.items.length, total: jobs.total })}</p>
          <Pagination
            page={jobs.page}
            totalPages={jobs.totalPages}
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

      <ImportWizardDialog open={wizardOpen} onOpenChange={setWizardOpen} />
      {detailJob ? <ImportDetailDialog job={detailJob} onOpenChange={(open) => !open && setDetailJob(null)} /> : null}

      <AlertDialog open={deleteJob !== null} onOpenChange={(open) => !open && setDeleteJob(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('imports.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="break-all">
              {t('imports.deleteDescription', { count: deleteJob?.createdRows ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Spinner size="sm" /> : null}
              {t('imports.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
