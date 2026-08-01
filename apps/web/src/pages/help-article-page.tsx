import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, CardContent, Skeleton, Spinner, toast } from '@wa/ui';
import { ArrowLeft, ArrowRight, BookOpen, ChevronLeft, ThumbsDown, ThumbsUp } from 'lucide-react';

import { useAuth } from '../lib/auth';
import { useHelpArticle, useHelpFeedback } from '../features/help/help-api';
import { HelpRichText } from '../features/help/help-renderer';

export function HelpArticlePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { categorySlug = '', articleSlug = '' } = useParams<{ categorySlug: string; articleSlug: string }>();
  const language = user?.preferredLanguage ?? 'ar';

  const { data: article, isLoading, isError } = useHelpArticle(categorySlug, articleSlug, language);
  const feedback = useHelpFeedback();
  const [gaveFeedback, setGaveFeedback] = React.useState(false);
  const [comment, setComment] = React.useState('');

  const submitFeedback = (wasHelpful: boolean) => {
    if (!article) return;
    feedback.mutate(
      { articleId: article.id, wasHelpful, comment: comment.trim() || undefined },
      {
        onSuccess: () => {
          setGaveFeedback(true);
          toast.success(t('help.thanksForFeedback'));
        },
        onError: () => toast.error(t('common.error')),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !article) {
    return (
      <Card className="mx-auto max-w-3xl">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">{t('help.noResults')}</CardContent>
      </Card>
    );
  }

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/help" className="hover:text-foreground">
          {t('help.breadcrumbHome')}
        </Link>
        <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
        <Link to={`/help/${article.categorySlug}`} className="hover:text-foreground">
          {article.categoryName}
        </Link>
        <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
        <span className="truncate text-foreground">{article.title}</span>
      </nav>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{t(`help.articleType.${article.articleType}`)}</Badge>
          <Badge variant="outline">{t(`help.difficulty.${article.difficulty}`)}</Badge>
          <span className="text-xs text-muted-foreground">
            {t('help.readingMinutes', { count: article.estimatedReadingMinutes })}
          </span>
          {article.fallbackLanguage ? (
            <Badge variant="warning">{t('help.fallbackNotice') ?? 'Fallback language'}</Badge>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{article.title}</h1>
        {article.summary ? <p className="text-muted-foreground">{article.summary}</p> : null}
        <p className="text-xs text-muted-foreground">{t('help.lastUpdated', { date: new Date(article.updatedAt).toLocaleDateString() })}</p>
      </header>

      <Card>
        <CardContent className="pt-6">
          <HelpRichText html={article.content} />
        </CardContent>
      </Card>

      {article.related && article.related.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t('help.relatedArticles')}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {article.related.map((related) => (
              <li key={related.id}>
                <Link
                  to={`/help/${related.categorySlug}/${related.slug}`}
                  className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {related.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(article.previous || article.next) && (
        <nav className="grid gap-3 sm:grid-cols-2" aria-label="Article navigation">
          {article.previous ? (
            <Link
              to={`/help/${article.previous.categorySlug}/${article.previous.slug}`}
              className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-accent"
            >
              <ArrowLeft className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">{t('help.prevArticle')}</span>
                <span className="block truncate font-medium">{article.previous.title}</span>
              </span>
            </Link>
          ) : (
            <span />
          )}
          {article.next ? (
            <Link
              to={`/help/${article.next.categorySlug}/${article.next.slug}`}
              className="flex items-center justify-end gap-2 rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-accent"
            >
              <span className="min-w-0 text-end">
                <span className="block text-xs text-muted-foreground">{t('help.nextArticle')}</span>
                <span className="block truncate font-medium">{article.next.title}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      <section className="rounded-lg border bg-card p-4">
        <p className="mb-2 text-sm font-medium">{t('help.wasHelpful')}</p>
        {gaveFeedback ? (
          <p className="text-sm text-muted-foreground">{t('help.thanksForFeedback')}</p>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => submitFeedback(true)} disabled={feedback.isPending}>
                {feedback.isPending ? <Spinner size="sm" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                {t('help.yes')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => submitFeedback(false)} disabled={feedback.isPending}>
                {feedback.isPending ? <Spinner size="sm" /> : <ThumbsDown className="h-3.5 w-3.5" />}
                {t('help.no')}
              </Button>
            </div>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={t('help.commentPlaceholder')}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={2}
            />
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => submitFeedback(true)} disabled={comment.trim().length === 0}>
                {t('help.submitFeedback')}
              </Button>
            </div>
          </div>
        )}
      </section>

      <nav className="flex justify-between">
        <Link to={`/help/${article.categorySlug}`} className="text-sm text-primary hover:underline">
          {t('help.backToCategory', { category: article.categoryName })}
        </Link>
      </nav>
    </article>
  );
}
