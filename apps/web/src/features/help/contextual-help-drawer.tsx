import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Spinner,
  toast,
} from '@wa/ui';
import { ArrowRight, BookOpen, ExternalLink, ThumbsDown, ThumbsUp } from 'lucide-react';

import { useHelpContext, useHelpFeedback, useRecordHelpView } from './help-api';
import { HelpRichText } from './help-renderer';

function useHelpLanguage(): 'ar' | 'en' {
  const { i18n } = useTranslation();
  return i18n.language === 'en' ? 'en' : 'ar';
}

export interface ContextualHelpDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  route: string;
  featureKey?: string;
}

export function ContextualHelpDrawer({ open, onOpenChange, route, featureKey }: ContextualHelpDrawerProps) {
  const { t } = useTranslation();
  const language = useHelpLanguage();
  const { data, isLoading } = useHelpContext(open ? route : '', featureKey, language);
  const feedback = useHelpFeedback();
  const recordView = useRecordHelpView();
  const [gaveFeedback, setGaveFeedback] = React.useState(false);

  React.useEffect(() => {
    if (open && data?.primary?.id) {
      recordView.mutate({ id: data.primary.id, route });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data?.primary?.id]);

  const primary = data?.primary;

  const submitFeedback = (wasHelpful: boolean) => {
    if (!primary) return;
    feedback.mutate(
      { articleId: primary.id, wasHelpful },
      {
        onSuccess: () => {
          setGaveFeedback(true);
          toast.success(t('help.thanksForFeedback'));
        },
        onError: () => toast.error(t('common.error')),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="text-start">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <SheetTitle className="text-base">{t('help.contextHelpTitle')}</SheetTitle>
          </div>
          <SheetDescription />
        </SheetHeader>

        <div className="mt-4 space-y-4 pb-8">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : primary ? (
            <>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{t(`help.articleType.${primary.articleType}`)}</Badge>
                  <Badge variant="outline">{t(`help.difficulty.${primary.difficulty}`)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {t('help.readingMinutes', { count: primary.estimatedReadingMinutes })}
                  </span>
                </div>
                <h2 className="text-lg font-semibold leading-tight">{primary.title}</h2>
                {primary.summary ? <p className="text-sm text-muted-foreground">{primary.summary}</p> : null}
              </div>

              {primary.content ? (
                <HelpRichText html={primary.content} />
              ) : (
                <p className="text-sm text-muted-foreground">{t('help.noContent') ?? primary.summary}</p>
              )}

              {data && data.related.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">{t('help.relatedArticles')}</h3>
                  <ul className="space-y-1">
                    {data.related.map((related) => (
                      <li key={related.id}>
                        <Link
                          to={`/help/${related.categorySlug}/${related.slug}`}
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          onClick={() => onOpenChange(false)}
                        >
                          {related.title}
                          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                <Link
                  to={`/help/${primary.categorySlug}/${primary.slug}`}
                  onClick={() => onOpenChange(false)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('help.openFullArticle')}
                </Link>
              </div>

              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">{t('help.wasHelpful')}</p>
                {gaveFeedback ? (
                  <p className="text-sm text-muted-foreground">{t('help.thanksForFeedback')}</p>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => submitFeedback(true)} disabled={feedback.isPending}>
                      <ThumbsUp className="h-3.5 w-3.5" />
                      {t('help.yes')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => submitFeedback(false)} disabled={feedback.isPending}>
                      <ThumbsDown className="h-3.5 w-3.5" />
                      {t('help.no')}
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{t('help.noResults')}</p>
              <Link to="/help" onClick={() => onOpenChange(false)}>
                <Button variant="outline" size="sm">
                  {t('help.openHelpCenter')}
                </Button>
              </Link>
            </div>
          )}

          {isLoading ? <Spinner className="py-4" /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
