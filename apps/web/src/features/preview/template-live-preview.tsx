import { useTranslation } from 'react-i18next';
import type { PreviewSampleValues } from '@wa/shared';
import { generatePreviewSampleValue } from '@wa/shared';
import { Button, Input, Label } from '@wa/ui';
import { Eraser, Sparkles } from 'lucide-react';

import { buildWhatsAppTemplateModel } from './preview-model';
import { WhatsAppPreviewPanel } from './preview-shell';

export interface TemplateLivePreviewProps {
  language: string;
  headerText: string;
  bodyText: string;
  footerText: string;
  buttons: Array<{ type: string; text: string; url?: string; phoneNumber?: string }>;
  sampleValues: PreviewSampleValues;
  onSampleChange: (values: PreviewSampleValues) => void;
  templateStatus?: string;
}

export function TemplateLivePreview({ language, headerText, bodyText, footerText, buttons, sampleValues, onSampleChange, templateStatus }: TemplateLivePreviewProps) {
  const { t } = useTranslation();

  const components: Array<{ type: string; format?: string; text?: string; buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }> }> = [];
  if (headerText.trim()) {
    components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
  }
  components.push({ type: 'BODY', text: bodyText });
  if (footerText.trim()) {
    components.push({ type: 'FOOTER', text: footerText });
  }
  if (buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: buttons.map((button) => ({
        type: button.type,
        text: button.text,
        url: button.url,
        phone_number: button.phoneNumber,
      })),
    });
  }

  const model = buildWhatsAppTemplateModel({
    account: { displayName: 'WhatsApp', phoneNumber: '+20 100 000 0000', verified: true },
    language: language.startsWith('ar') ? 'ar' : 'en',
    components,
    sampleValues,
  });

  const positions = [...new Set(model.variables.map((variable) => variable.position))].sort((a, b) => a - b);

  return (
    <WhatsAppPreviewPanel
      model={model}
      templateStatus={templateStatus}
      extraControls={
        positions.length > 0 ? (
          <div className="rounded-lg border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">{t('preview.sample.label')}</span>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => {
                const next: PreviewSampleValues = {};
                for (const position of positions) next[position] = generatePreviewSampleValue(position);
                onSampleChange(next);
              }}>
                <Sparkles className="h-3 w-3" /> {t('preview.sample.generate')}
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => onSampleChange({})}>
                <Eraser className="h-3 w-3" /> {t('preview.sample.clear')}
              </Button>
            </div>
            <div className="space-y-2">
              {positions.map((position) => (
                <div key={position} className="space-y-1">
                  <Label className="font-mono text-xs text-muted-foreground">{`{{${position}}}`}</Label>
                  <Input
                    dir="auto"
                    className="h-8 text-xs"
                    value={sampleValues[position] ?? ''}
                    placeholder={generatePreviewSampleValue(position)}
                    onChange={(event) => onSampleChange({ ...sampleValues, [position]: event.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : undefined
      }
    />
  );
}
