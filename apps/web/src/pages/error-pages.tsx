import { useTranslation } from 'react-i18next';
import { Button, Card, CardContent } from '@wa/ui';
import { Ban, FileQuestion } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function ForbiddenPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <div className="rounded-full bg-muted p-4">
            <Ban className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <h1 className="mt-2 text-xl font-semibold">{t('errors.forbiddenTitle')}</h1>
          <p className="max-w-sm text-sm text-muted-foreground">{t('errors.forbiddenDescription')}</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>
            {t('nav.home')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="rounded-full bg-muted p-4">
        <FileQuestion className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 className="mt-2 text-xl font-semibold">{t('errors.notFoundTitle')}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t('errors.notFoundDescription')}</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>
        {t('nav.home')}
      </Button>
    </div>
  );
}
