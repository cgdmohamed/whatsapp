import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

export function EmptyStateHelpLink({ categorySlug, slug }: { categorySlug: string; slug: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/help/${categorySlug}/${slug}`}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
    >
      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
      {t('help.openHelpCenter')}
    </Link>
  );
}
