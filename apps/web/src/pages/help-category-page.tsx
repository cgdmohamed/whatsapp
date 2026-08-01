import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Badge, Card, CardContent, Pagination, Skeleton } from '@wa/ui';
import { ChevronLeft, FileText } from 'lucide-react';

import { useAuth } from '../lib/auth';
import { useHelpArticles } from '../features/help/help-api';

const PAGE_SIZE = 24;

export function HelpCategoryPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { categorySlug = '' } = useParams<{ categorySlug: string }>();
  const language = user?.preferredLanguage ?? 'ar';
  const [page, setPage] = React.useState(1);

  const { data, isLoading } = useHelpArticles({ categorySlug, page, pageSize: PAGE_SIZE, language });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/help" className="hover:text-foreground">
          {t('help.breadcrumbHome')}
        </Link>
        <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
        <span className="text-foreground">{data?.items[0]?.categoryName ?? categorySlug}</span>
      </nav>

      <h1 className="text-2xl font-semibold tracking-tight">{data?.items[0]?.categoryName ?? categorySlug}</h1>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : (data?.items ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{t('help.noResults')}</CardContent>
        </Card>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {(data?.items ?? []).map((item) => (
              <li key={item.id}>
                <Link
                  to={`/help/${item.categorySlug}/${item.slug}`}
                  className="flex flex-col gap-1 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    {item.title}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{t(`help.articleType.${item.articleType}`)}</Badge>
                    {t('help.readingMinutes', { count: item.estimatedReadingMinutes })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {data && data.totalPages > 1 ? (
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              onPageChange={setPage}
              labels={{
                firstPage: t('common.firstPage'),
                lastPage: t('common.lastPage'),
                prevPage: t('common.previousPage'),
                nextPage: t('common.nextPage'),
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
