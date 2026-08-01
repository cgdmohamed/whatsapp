import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@wa/ui';
import { BookOpen, CheckCircle2, Circle, EyeOff, ListChecks } from 'lucide-react';

import { useOnboarding, useSetOnboardingVisibility, useToggleOnboardingStep } from './help-api';

const ARTICLE_CATEGORY: Record<string, string> = {
  'connecting-meta-whatsapp-cloud-api': 'whatsapp-configuration',
  'synchronizing-message-templates': 'message-templates',
  'importing-contacts-from-excel': 'contacts',
  'understanding-consent-and-suppression': 'consent-suppression',
  'creating-the-first-campaign': 'campaigns',
  'managing-users-and-permissions': 'users-permissions',
};

export function OnboardingChecklist() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const onboarding = useOnboarding();
  const toggle = useToggleOnboardingStep();
  const setVisibility = useSetOnboardingVisibility();

  if (onboarding.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }
  const data = onboarding.data;
  if (!data) {
    return null;
  }

  if (data.hidden) {
    return (
      <div className="flex items-center justify-between rounded-lg border bg-card p-3">
        <p className="text-sm text-muted-foreground">{t('onboarding.title')}</p>
        <Button variant="outline" size="sm" onClick={() => void setVisibility.mutateAsync(false)}>
          <ListChecks className="h-4 w-4" /> {t('onboarding.restore')}
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{t('onboarding.title')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('onboarding.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {t('onboarding.progress', { done: data.completedCount, total: data.total })}
          </span>
          <Button variant="ghost" size="icon" aria-label={t('onboarding.hide')} onClick={() => void setVisibility.mutateAsync(true)}>
            <EyeOff className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {data.allCompleted ? (
          <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success-foreground">
            {t('onboarding.allDone')}
          </p>
        ) : null}
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {data.steps.map((step) => (
            <li key={step.key} className="flex items-start gap-2 rounded-lg border bg-card p-3">
              <button
                type="button"
                aria-label={step.completed ? t('onboarding.toggleOff') : t('onboarding.toggle')}
                className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
                onClick={() => void toggle.mutateAsync({ key: step.key, completed: !step.completed })}
              >
                {step.completed ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5" />}
              </button>
              <div className="min-w-0">
                <p className={`text-sm font-medium ${step.completed ? 'text-muted-foreground line-through' : ''}`}>
                  {t(`onboarding.step.${step.key}.label`)}
                </p>
                <p className="text-xs text-muted-foreground">{t(`onboarding.step.${step.key}.description`)}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                  {step.link ? (
                    <button type="button" className="text-primary hover:underline" onClick={() => navigate(step.link!)}>
                      {t('common.open')}
                    </button>
                  ) : null}
                  {step.articleSlug ? (
                    <Link to={`/help/${ARTICLE_CATEGORY[step.articleSlug] ?? 'getting-started'}/${step.articleSlug}`} className="text-primary hover:underline">
                      <span className="inline-flex items-center gap-1">
                        <BookOpen className="h-3 w-3" /> {t('help.title')}
                      </span>
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
