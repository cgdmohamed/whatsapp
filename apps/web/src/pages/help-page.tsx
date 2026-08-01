import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton } from '@wa/ui';
import { BookOpen, FileText, Search } from 'lucide-react';

import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/page-header';
import { useDebouncedValue } from '../hooks/use-debounce';
import { useHelpArticles, useHelpCategories, useHelpSearch } from '../features/help/help-api';

function localized(category: { nameAr: string; nameEn: string }, language: string): string {
  return language === 'ar' ? category.nameAr : category.nameEn;
}

export function HelpPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [search, setSearch] = React.useState('');
  const debounced = useDebouncedValue(search, 300);
  const language = user?.preferredLanguage ?? 'ar';

  const categories = useHelpCategories();
  const searchResults = useHelpSearch(debounced, language);
  const allArticles = useHelpArticles({ page: 1, pageSize: 60, language });

  const featured = (allArticles.data?.items ?? []).filter((item) => item.isFeatured).slice(0, 6);
  const recentlyUpdated = [...(allArticles.data?.items ?? [])]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 6);

  return (
    <div className="space-y-8">
      <PageHeader title={t('help.title')} description={t('help.description')} />

      <div className="mx-auto max-w-2xl">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            role="searchbox"
            aria-label={t('help.searchLabel')}
            placeholder={t('help.searchPlaceholder')}
            className="ps-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {debounced.trim().length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-sm text-muted-foreground">{t('help.resultsFor', { query: debounced })}</p>
            {searchResults.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : searchResults.data?.noResults ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t('help.noResults')}</p>
            ) : (
              <ul className="space-y-2">
                {(searchResults.data?.items ?? []).slice(0, 12).map((item) => (
                  <li key={item.id}>
                    <Link
                      to={`/help/${item.categorySlug}/${item.slug}`}
                      className="flex flex-col gap-1 rounded-lg border bg-card p-3 transition-colors hover:bg-accent"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        {item.title}
                      </span>
                      {item.highlight ? (
                        <span className="text-sm text-muted-foreground">{item.highlight}</span>
                      ) : item.summary ? (
                        <span className="line-clamp-2 text-sm text-muted-foreground">{item.summary}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {debounced.trim().length === 0 ? (
        <>
          <section>
            <h2 className="mb-3 text-lg font-semibold">{t('help.categories')}</h2>
            {categories.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-28 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(categories.data ?? []).map((category) => (
                  <Link key={category.id} to={`/help/${category.slug}`}>
                    <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{localized(category, language)}</CardTitle>
                          <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        </div>
                        <CardDescription>{localized(category, language)}</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <Badge variant="secondary">{category.articleCount ?? 0}</Badge>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {featured.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-semibold">{t('help.featured')}</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {featured.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={`/help/${item.categorySlug}/${item.slug}`}
                      className="flex flex-col gap-1 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-medium">
                        {item.title}
                        <Badge variant="success">{t('help.featuredLabel')}</Badge>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.categoryName} · {t('help.readingMinutes', { count: item.estimatedReadingMinutes })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {recentlyUpdated.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-semibold">{t('help.recentlyUpdated')}</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {recentlyUpdated.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={`/help/${item.categorySlug}/${item.slug}`}
                      className="flex flex-col gap-1 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
                    >
                      <span className="text-sm font-medium">{item.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.categoryName} · {t('help.lastUpdated', { date: new Date(item.updatedAt).toLocaleDateString() })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
