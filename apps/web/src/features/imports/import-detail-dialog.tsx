import { useTranslation } from 'react-i18next';
import type { ImportJobDto } from '@wa/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@wa/ui';

import { useImportDetail } from './api';

interface ImportDetailDialogProps {
  job: ImportJobDto;
  onOpenChange: (open: boolean) => void;
}

export function ImportDetailDialog({ job, onOpenChange }: ImportDetailDialogProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useImportDetail(job.id);

  const rows = data?.rows ?? [];

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{job.originalFilename}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('imports.noRows')}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">{t('imports.row')}</TableHead>
                  <TableHead>{t('imports.phone')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('imports.errors')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-muted-foreground">{row.rowNumber}</TableCell>
                    <TableCell className="break-all" dir="ltr">
                      {row.normalizedPhone ?? '—'}
                    </TableCell>
                    <TableCell>{t(`imports.rowStatus.${row.status}`)}</TableCell>
                    <TableCell className="max-w-64 break-words text-muted-foreground">
                      {row.errorMessages.length > 0 ? row.errorMessages.join('; ') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
