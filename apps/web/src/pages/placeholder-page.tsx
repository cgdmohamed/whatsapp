import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@wa/ui';
import { Construction } from 'lucide-react';

import { PageHeader } from '../components/page-header';

export function PlaceholderPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.auditLog')} description={t('placeholder.description')} />
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <div className="rounded-full bg-muted p-4">
            <Construction className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <h2 className="mt-2 text-lg font-semibold">{t('placeholder.title')}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t('placeholder.description')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
