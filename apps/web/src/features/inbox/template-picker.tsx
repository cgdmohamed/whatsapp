import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { PreviewSampleValues } from '@wa/shared';
import { generatePreviewSampleValue } from '@wa/shared';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Skeleton } from '@wa/ui';
import { FileText } from 'lucide-react';

import { useMessageTemplates } from '../whatsapp/templates-api';
import { buildWhatsAppTemplateModel } from '../preview/preview-model';
import { WhatsAppPreviewPanel } from '../preview/preview-shell';

export function TemplatePicker({ open, onOpenChange, onUse }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: (text: string) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useMessageTemplates({ page: 1, pageSize: 50, language: 'ar', status: 'APPROVED' } as never);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [sampleValues, setSampleValues] = React.useState<PreviewSampleValues>({});

  const selected = (data?.items ?? []).find((item) => item.id === selectedId);
  const language = selected?.language?.startsWith('ar') ? 'ar' : 'en';

  const model = selected
    ? buildWhatsAppTemplateModel({
        account: { displayName: 'WhatsApp', phoneNumber: '+20 100 000 0000', verified: true },
        language,
        components: (selected.components ?? []) as never,
        sampleValues,
      })
    : null;

  const positions = model ? [...new Set(model.variables.map((variable) => variable.position))].sort((a, b) => a - b) : [];

  React.useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setSampleValues({});
    }
  }, [open]);

  const handleUse = () => {
    if (!model) return;
    onUse(model.message.body);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('inbox.templatePicker') ?? 'Choose a template'}</DialogTitle>
          <DialogDescription>{t('inbox.templatePickerHint') ?? 'Preview the message before inserting. Nothing is sent automatically.'}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="max-h-72 overflow-y-auto rounded-lg border">
            {isLoading ? (
              <div className="space-y-2 p-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : (data?.items ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{t('templates.noTemplates')}</p>
            ) : (
              <ul>
                {(data?.items ?? []).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(item.id);
                        setSampleValues({});
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-accent ${selectedId === item.id ? 'bg-accent' : ''}`}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{item.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            {!model ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t('inbox.selectTemplate') ?? 'Select a template to preview it.'}</p>
            ) : (
              <WhatsAppPreviewPanel
                model={model}
                templateStatus="APPROVED"
                extraControls={
                  positions.length > 0 ? (
                    <div className="rounded-lg border bg-card p-3">
                      <span className="mb-2 block text-sm font-semibold">{t('preview.sample.label')}</span>
                      <div className="space-y-2">
                        {positions.map((position) => (
                          <div key={position} className="space-y-1">
                            <Label className="font-mono text-xs text-muted-foreground">{`{{${position}}}`}</Label>
                            <Input
                              dir="auto"
                              className="h-8 text-xs"
                              value={sampleValues[position] ?? ''}
                              placeholder={generatePreviewSampleValue(position)}
                              onChange={(event) => setSampleValues({ ...sampleValues, [position]: event.target.value })}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : undefined
                }
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleUse} disabled={!model}>{t('inbox.useTemplate') ?? 'Use template'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
