import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ConfigureImportInput, ImportableField, ImportUploadDto, ImportValidationSummaryDto } from '@wa/shared';
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@wa/ui';
import { AlertTriangle, CheckCircle2, FileUp, RefreshCw } from 'lucide-react';

import { useConfigureImport, useStartImport, useUploadImport } from './api';

const IMPORTABLE_FIELDS: readonly ImportableField[] = [
  'phone',
  'first_name',
  'last_name',
  'display_name',
  'email',
  'company',
  'language',
  'source',
  'tags',
  'list',
  'opt_in_status',
  'opt_in_source',
  'opt_in_date',
];

const ALIASES: Record<string, readonly string[]> = {
  phone: ['phone', 'mobile', 'tel', 'phone number', 'telephone', 'رقم الهاتف', 'الموبايل', 'الهاتف'],
  first_name: ['firstname', 'first name', 'first', 'given name', 'الاسم الاول', 'الاسم الأول', 'اسم اول'],
  last_name: ['lastname', 'last name', 'last', 'family name', 'surname', 'اسم العائلة', 'الاسم الاخير', 'اللقب'],
  display_name: ['displayname', 'display name', 'name', 'fullname', 'full name', 'الاسم', 'الاسم الكامل'],
  email: ['email', 'e-mail', 'email address', 'الايميل', 'البريد الالكتروني', 'البريد'],
  company: ['company', 'organization', 'organisation', 'business', 'الشركة', 'المؤسسة'],
  language: ['language', 'lang', 'اللغة', 'لغة'],
  source: ['source', 'المصدر', 'مصدر'],
  tags: ['tags', 'tag', 'وسوم', 'الوسوم', 'كلمات مفتاحية'],
  list: ['list', 'listname', 'قائمة', 'القائمة', 'اسم القائمة'],
  opt_in_status: ['optin', 'opt in', 'opt-in', 'optin status', 'opt-in status', 'consent', 'consent status', 'حالة الموافقة', 'موافقة'],
  opt_in_source: ['optin source', 'opt-in source', 'consent source', 'مصدر الموافقة', 'وسيلة الموافقة'],
  opt_in_date: ['optin date', 'opt-in date', 'consent date', 'date', 'تاريخ الموافقة', 'التاريخ'],
};

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '');
}

export function autoMapColumns(headers: string[]): Record<string, ImportableField> {
  const mapping: Record<string, ImportableField> = {};
  const used = new Set<string>();
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    const field = (Object.keys(ALIASES) as ImportableField[]).find((key) => {
      const aliases = (ALIASES[key] ?? []).map(normalizeHeader);
      return aliases.includes(normalized) || aliases.includes(header.trim().toLowerCase());
    });
    if (field && !used.has(field)) {
      mapping[header] = field;
      used.add(field);
    }
  }
  return mapping;
}

type Step = 'upload' | 'configure' | 'review';

interface ImportWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportWizardDialog({ open, onOpenChange }: ImportWizardDialogProps) {
  const { t } = useTranslation();
  const uploadMutation = useUploadImport();
  const configureMutation = useConfigureImport();
  const startMutation = useStartImport();

  const [step, setStep] = React.useState<Step>('upload');
  const [file, setFile] = React.useState<File | null>(null);
  const [upload, setUpload] = React.useState<ImportUploadDto | null>(null);
  const [summary, setSummary] = React.useState<ImportValidationSummaryDto | null>(null);
  const [sheetName, setSheetName] = React.useState<string>('');
  const [columnMapping, setColumnMapping] = React.useState<Record<string, ImportableField>>({});
  const [updateMode, setUpdateMode] = React.useState<'none' | 'merge-empty' | 'replace'>('none');
  const [skipDuplicates, setSkipDuplicates] = React.useState(false);
  const [defaultCountry, setDefaultCountry] = React.useState('EG');

  React.useEffect(() => {
    if (open) {
      setStep('upload');
      setFile(null);
      setUpload(null);
      setSummary(null);
      setSheetName('');
      setColumnMapping({});
      setUpdateMode('none');
      setSkipDuplicates(false);
      setDefaultCountry('EG');
    }
  }, [open]);

  const headers = upload?.headers ?? [];

  const handleFileSelected = async (selected: File | null) => {
    if (!selected) {
      return;
    }
    setFile(selected);
    try {
      const result = await uploadMutation.mutateAsync({ file: selected });
      setUpload(result);
      setSheetName(result.sheets.length > 1 ? (result.sheets[0] ?? '') : '');
      setColumnMapping(autoMapColumns(result.headers));
      setStep('configure');
    } catch (error) {
      setFile(null);
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleValidate = async () => {
    if (!upload) {
      return;
    }
    const mapping: Record<string, ImportableField> = {};
    for (const [column, field] of Object.entries(columnMapping)) {
      if (field && headers.includes(column)) {
        mapping[column] = field;
      }
    }
    const input: ConfigureImportInput = {
      sheetName: sheetName || undefined,
      hasHeader: true,
      columnMapping: mapping,
      options: {
        defaultCountry,
        hasHeader: true,
        updateMode,
        skipDuplicates,
        treatMissingConsentAsUnknown: true,
        tagIds: [],
      },
    };
    try {
      const result = await configureMutation.mutateAsync({ jobId: upload.jobId, input });
      setSummary(result);
      setStep('review');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleStart = async () => {
    if (!upload) {
      return;
    }
    try {
      await startMutation.mutateAsync(upload.jobId);
      toast.success(t('imports.started'));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const busy = uploadMutation.isPending || configureMutation.isPending || startMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('imports.wizardTitle')}</DialogTitle>
          <DialogDescription>{t('imports.wizardDescription')}</DialogDescription>
        </DialogHeader>

        {step === 'upload' ? (
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center hover:bg-muted/50">
              <FileUp className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">{file ? file.name : t('imports.dropFile')}</span>
              <span className="text-xs text-muted-foreground">{t('imports.supportedFormats')}</span>
              <Input
                type="file"
                accept=".csv,.xlsx"
                className="sr-only"
                disabled={uploadMutation.isPending}
                onChange={(event) => void handleFileSelected(event.target.files?.[0] ?? null)}
              />
            </label>
            {uploadMutation.isPending ? (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Spinner size="sm" />
                {t('imports.uploading')}
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 'configure' && upload ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {upload.originalFilename} · {upload.totalRows} {t('imports.rows')}
              </p>
              {upload.sheets.length > 1 ? (
                <div className="flex items-center gap-2">
                  <Label className="shrink-0 text-xs">{t('imports.sheet')}</Label>
                  <Select value={sheetName} onValueChange={setSheetName}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {upload.sheets.map((sheet) => (
                        <SelectItem key={sheet} value={sheet}>
                          {sheet}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('imports.columnMapping')}</Label>
              <div className="space-y-2 rounded-md border p-3">
                {headers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('imports.noHeaders')}</p>
                ) : (
                  headers.map((header) => (
                    <div key={header} className="grid gap-2 sm:grid-cols-2">
                      <p className="truncate text-sm" dir="ltr">
                        {header}
                      </p>
                      <Select
                        value={columnMapping[header] ?? ''}
                        onValueChange={(value) =>
                          setColumnMapping((current) => {
                            const next = { ...current };
                            if (value) {
                              next[header] = value as ImportableField;
                            } else {
                              delete next[header];
                            }
                            return next;
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('imports.notImported')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">{t('imports.notImported')}</SelectItem>
                          {IMPORTABLE_FIELDS.map((field) => (
                            <SelectItem key={field} value={field}>
                              {t(`imports.fields.${field}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('imports.options')}</Label>
              <div className="grid gap-4 rounded-md border p-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('imports.updateMode')}</Label>
                  <Select value={updateMode} onValueChange={(value) => setUpdateMode(value as typeof updateMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('imports.modes.none')}</SelectItem>
                      <SelectItem value="merge-empty">{t('imports.modes.merge-empty')}</SelectItem>
                      <SelectItem value="replace">{t('imports.modes.replace')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('imports.defaultCountry')}</Label>
                  <Input value={defaultCountry} maxLength={2} className="uppercase" onChange={(event) => setDefaultCountry(event.target.value.toUpperCase())} />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input type="checkbox" checked={skipDuplicates} onChange={(event) => setSkipDuplicates(event.target.checked)} />
                  {t('imports.skipDuplicates')}
                </label>
              </div>
            </div>

            {upload.previewRows.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('imports.preview')}</Label>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {headers.map((header) => (
                          <TableHead key={header} className="whitespace-nowrap" dir="ltr">
                            {header}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {upload.previewRows.map((row, rowIndex) => (
                        <TableRow key={rowIndex}>
                          {row.map((cell, cellIndex) => (
                            <TableCell key={cellIndex} className="whitespace-nowrap text-xs">
                              {String(cell ?? '')}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 'review' && summary ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t('imports.totalRows')} value={summary.totalRows} />
              <Stat label={t('imports.validRows')} value={summary.validRows} />
              <Stat label={t('imports.invalidRows')} value={summary.invalidRows} />
              <Stat label={t('imports.duplicateRows')} value={summary.duplicateRows} />
            </div>
            {summary.invalidRows === 0 ? (
              <Alert variant="info">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>{t('imports.allValid')}</AlertTitle>
                <AlertDescription>{t('imports.allValidDescription')}</AlertDescription>
              </Alert>
            ) : (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{t('imports.hasIssues')}</AlertTitle>
                <AlertDescription>{t('imports.hasIssuesDescription')}</AlertDescription>
              </Alert>
            )}
            {summary.issues.length > 0 ? (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-3 text-xs">
                {summary.issues.map((issue) => (
                  <p key={`${issue.rowNumber}-${issue.reason}`} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t('imports.row')} {issue.rowNumber}</span>
                    <span>{issue.reason}</span>
                  </p>
                ))}
              </div>
            ) : null}
            {summary.invalidRows > 0 ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="h-3 w-3" />
                {t('imports.invalidWillSkip')}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          {step === 'configure' ? (
            <Button variant="outline" onClick={() => setStep('upload')} disabled={busy}>
              {t('common.back')}
            </Button>
          ) : null}
          {step === 'review' ? (
            <Button variant="outline" onClick={() => setStep('configure')} disabled={busy}>
              {t('common.back')}
            </Button>
          ) : null}
          {step === 'configure' ? (
            <Button onClick={() => void handleValidate()} disabled={busy || headers.length === 0}>
              {configureMutation.isPending ? <Spinner size="sm" /> : null}
              {t('imports.validate')}
            </Button>
          ) : null}
          {step === 'review' ? (
            <Button onClick={() => void handleStart()} disabled={busy}>
              {startMutation.isPending ? <Spinner size="sm" /> : null}
              {t('imports.start')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
