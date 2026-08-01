import { useTranslation } from 'react-i18next';

import { PageHeader } from '../components/page-header';
import { ContextualHelpButton } from '../features/help/help-drawer-provider';
import { TemplatesPanel } from '../features/whatsapp/templates-panel';

export function TemplatesPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('templates.title')}
        description={t('templates.description')}
        actions={<ContextualHelpButton featureKey="templates" />}
      />
      <TemplatesPanel />
    </div>
  );
}
