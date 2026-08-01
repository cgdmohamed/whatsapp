import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
} from '@wa/ui';
import { Copy, Eye, Pencil, Plus, RefreshCw, Trash2, History, CheckCircle2, XCircle } from 'lucide-react';

import { PageHeader } from '../components/page-header';
import {
  useAdminHelpAnalytics,
  useAdminHelpArticles,
  useAdminHelpArticle,
  useAdminHelpCategories,
  useAdminHelpFeedback,
  useAdminHelpVersions,
  useArchiveHelpArticle,
  useArchiveHelpCategory,
  useCreateHelpArticle,
  useCreateHelpCategory,
  useDuplicateHelpArticle,
  usePublishHelpArticle,
  useUnpublishHelpArticle,
  useUpdateHelpArticle,
  useUpdateHelpCategory,
  useRestoreHelpVersion,
} from '../features/help/help-api';
import { HelpRichText } from '../features/help/help-renderer';
import type { HelpArticleInput, HelpCategoryDto } from '@wa/shared';

type Tab = 'categories' | 'articles' | 'feedback' | 'analytics';

const ROLE_LABELS: Record<string, string> = { ADMIN: 'ADMIN', MANAGER: 'MANAGER', AGENT: 'AGENT' };

function emptyArticleForm(categories: HelpCategoryDto[]): HelpArticleInput {
  return {
    categoryId: categories[0]?.id ?? '',
    titleAr: '',
    titleEn: '',
    slug: '',
    summaryAr: '',
    summaryEn: '',
    contentAr: '',
    contentEn: '',
    articleType: 'STEP_BY_STEP',
    difficulty: 'BASIC',
    estimatedReadingMinutes: 3,
    allowedRoles: ['ADMIN', 'MANAGER', 'AGENT'],
    routePatterns: [],
    featureKey: null,
    keywords: [],
    isFeatured: false,
    isContextual: true,
    sortOrder: 0,
  };
}

export function HelpAdminPage() {
  const { t } = useTranslation();
  const [tab, setTab] = React.useState<Tab>('articles');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'articles', label: t('helpAdmin.tabs.articles') },
    { key: 'categories', label: t('helpAdmin.tabs.categories') },
    { key: 'feedback', label: t('helpAdmin.tabs.feedback') },
    { key: 'analytics', label: t('helpAdmin.tabs.analytics') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('helpAdmin.title')} description={t('helpAdmin.description')} />
      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <Button key={item.key} variant={tab === item.key ? 'default' : 'outline'} size="sm" onClick={() => setTab(item.key)}>
            {item.label}
          </Button>
        ))}
      </div>

      {tab === 'articles' ? <ArticlesTab /> : null}
      {tab === 'categories' ? <CategoriesTab /> : null}
      {tab === 'feedback' ? <FeedbackTab /> : null}
      {tab === 'analytics' ? <AnalyticsTab /> : null}
    </div>
  );
}

// ---------- Categories ----------

function CategoriesTab() {
  const { t } = useTranslation();
  const categories = useAdminHelpCategories();
  const createCategory = useCreateHelpCategory();
  const updateCategory = useUpdateHelpCategory();
  const archiveCategory = useArchiveHelpCategory();
  const [editing, setEditing] = React.useState<HelpCategoryDto | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" /> {t('helpAdmin.newCategory')}
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          {categories.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('helpAdmin.category')}</TableHead>
                  <TableHead>{t('helpAdmin.slug')}</TableHead>
                  <TableHead>{t('helpAdmin.status')}</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(categories.data ?? []).map((category) => (
                  <TableRow key={category.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{category.nameAr}</span>
                        <span className="text-xs text-muted-foreground">{category.nameEn}</span>
                      </div>
                    </TableCell>
                    <TableCell dir="ltr">{category.slug}</TableCell>
                    <TableCell>
                      <Badge variant={category.status === 'PUBLISHED' ? 'success' : 'secondary'}>{t(`helpAdmin.status.${category.status}`)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" aria-label={t('helpAdmin.edit')} onClick={() => { setEditing(category); setDialogOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={t('helpAdmin.archive')} onClick={() => void archiveCategory.mutateAsync(category.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editing}
        onSave={async (input) => {
          if (editing) {
            await updateCategory.mutateAsync({ id: editing.id, input });
          } else {
            await createCategory.mutateAsync(input);
          }
          toast.success(t('common.success'));
        }}
      />
    </div>
  );
}

function CategoryDialog({ open, onOpenChange, category, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: HelpCategoryDto | null;
  onSave: (input: { nameAr: string; nameEn: string; slug: string; descriptionAr?: string; descriptionEn?: string; icon?: string }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [form, setForm] = React.useState({ nameAr: '', nameEn: '', slug: '', descriptionAr: '', descriptionEn: '', icon: '' });

  React.useEffect(() => {
    setForm({
      nameAr: category?.nameAr ?? '',
      nameEn: category?.nameEn ?? '',
      slug: category?.slug ?? '',
      descriptionAr: category?.descriptionAr ?? '',
      descriptionEn: category?.descriptionEn ?? '',
      icon: category?.icon ?? '',
    });
  }, [category, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? t('helpAdmin.edit') : t('helpAdmin.newCategory')}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>{t('helpAdmin.titleAr')}</Label><Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('helpAdmin.titleEn')}</Label><Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></div>
          </div>
          <div className="space-y-1"><Label>{t('helpAdmin.slug')}</Label><Input dir="ltr" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
          <div className="space-y-1"><Label>{t('helpAdmin.summaryAr')}</Label><Textarea value={form.descriptionAr} onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })} /></div>
          <div className="space-y-1"><Label>{t('helpAdmin.summaryEn')}</Label><Textarea value={form.descriptionEn} onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('helpAdmin.cancel')}</Button>
          <Button onClick={() => void onSave({ ...form, descriptionAr: form.descriptionAr || undefined, descriptionEn: form.descriptionEn || undefined, icon: form.icon || undefined })}>{t('helpAdmin.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Articles ----------

function ArticlesTab() {
  const { t } = useTranslation();
  const articles = useAdminHelpArticles({ page: 1, pageSize: 50, language: 'ar' });
  const categories = useAdminHelpCategories();
  const publish = usePublishHelpArticle();
  const unpublish = useUnpublishHelpArticle();
  const duplicate = useDuplicateHelpArticle();
  const archive = useArchiveHelpArticle();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [versionsForId, setVersionsForId] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<string>('');

  const filtered = (articles.data?.items ?? []).filter((item) => (statusFilter ? item.status === statusFilter : true));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t('common.all')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('common.all')}</SelectItem>
            <SelectItem value="DRAFT">{t('helpAdmin.status.DRAFT')}</SelectItem>
            <SelectItem value="PUBLISHED">{t('helpAdmin.status.PUBLISHED')}</SelectItem>
            <SelectItem value="ARCHIVED">{t('helpAdmin.status.ARCHIVED')}</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => { setEditingId(null); setEditorOpen(true); }}>
          <Plus className="h-4 w-4" /> {t('helpAdmin.newArticle')}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {articles.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('helpAdmin.noArticles')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('helpAdmin.category')}</TableHead>
                  <TableHead>{t('helpAdmin.titleAr')}</TableHead>
                  <TableHead>{t('helpAdmin.status')}</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs text-muted-foreground">{item.categoryName}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{item.title}</span>
                        <span className="text-xs text-muted-foreground">{item.slug}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.status === 'PUBLISHED' ? 'success' : item.status === 'ARCHIVED' ? 'destructive' : 'secondary'}>
                        {t(`helpAdmin.status.${item.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" aria-label={t('helpAdmin.edit')} onClick={() => { setEditingId(item.id); setEditorOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {item.status === 'PUBLISHED' ? (
                          <Button variant="ghost" size="icon" aria-label={t('helpAdmin.unpublish')} onClick={() => void unpublish.mutateAsync(item.id)}>
                            <XCircle className="h-4 w-4 text-warning" />
                          </Button>
                        ) : item.status === 'DRAFT' ? (
                          <Button variant="ghost" size="icon" aria-label={t('helpAdmin.publish')} onClick={() => void publish.mutateAsync(item.id)}>
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="icon" aria-label={t('helpAdmin.duplicate')} onClick={() => void duplicate.mutateAsync(item.id)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={t('helpAdmin.versions')} onClick={() => setVersionsForId(item.id)}>
                          <History className="h-4 w-4" />
                        </Button>
                        {item.status !== 'ARCHIVED' ? (
                          <Button variant="ghost" size="icon" aria-label={t('helpAdmin.archive')} onClick={() => void archive.mutateAsync(item.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ArticleEditorDialog open={editorOpen} onOpenChange={setEditorOpen} articleId={editingId} categories={categories.data ?? []} />
      <VersionsDialog articleId={versionsForId} onOpenChange={(open) => { if (!open) setVersionsForId(null); }} open={versionsForId !== null} />
    </div>
  );
}

function ArticleEditorDialog({ open, onOpenChange, articleId, categories }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articleId: string | null;
  categories: HelpCategoryDto[];
}) {
  const { t } = useTranslation();
  const create = useCreateHelpArticle();
  const update = useUpdateHelpArticle();
  const detail = useAdminHelpArticle(articleId);
  const [lang, setLang] = React.useState<'ar' | 'en'>('ar');
  const [preview, setPreview] = React.useState(false);
  const [form, setForm] = React.useState<HelpArticleInput>(emptyArticleForm(categories));

  const set = <K extends keyof HelpArticleInput>(key: K, value: HelpArticleInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  React.useEffect(() => {
    if (open) {
      setPreview(false);
      setForm(emptyArticleForm(categories));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, articleId]);

  React.useEffect(() => {
    if (articleId && detail.data) {
      const data = detail.data;
      setForm({
        categoryId: data.categoryId,
        titleAr: data.titleAr, titleEn: data.titleEn, slug: data.slug,
        summaryAr: data.summaryAr ?? '', summaryEn: data.summaryEn ?? '',
        contentAr: data.contentAr ?? '', contentEn: data.contentEn ?? '',
        articleType: data.articleType, difficulty: data.difficulty,
        estimatedReadingMinutes: data.estimatedReadingMinutes,
        allowedRoles: data.allowedRoles, routePatterns: data.routePatterns,
        featureKey: data.featureKey, keywords: data.keywords,
        isFeatured: data.isFeatured, isContextual: data.isContextual, sortOrder: data.sortOrder,
      });
    }
  }, [articleId, detail.data]);

  const buildInput = (): HelpArticleInput => ({
    ...form,
    routePatterns: form.routePatterns ?? [],
    keywords: form.keywords ?? [],
    changeSummary: form.changeSummary ?? undefined,
  });

  const handleSave = async (publishNow: boolean) => {
    const input = { ...buildInput(), status: publishNow ? ('PUBLISHED' as const) : undefined };
    try {
      if (articleId) {
        await update.mutateAsync({ id: articleId, input });
      } else {
        await create.mutateAsync(input);
      }
      toast.success(t('common.success'));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const content = lang === 'ar' ? (form.contentAr ?? '') : (form.contentEn ?? '');
  const setContent = (value: string) => set(lang === 'ar' ? 'contentAr' : 'contentEn', value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{articleId ? t('helpAdmin.edit') : t('helpAdmin.newArticle')}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={lang} onValueChange={(value) => { setLang(value as 'ar' | 'en'); setPreview(false); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ar">العربية</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setPreview((p) => !p)}>
              <Eye className="h-4 w-4" /> {preview ? (lang === 'ar' ? t('helpAdmin.titleAr') : t('helpAdmin.titleEn')) : (lang === 'ar' ? t('helpAdmin.previewAr') : t('helpAdmin.previewEn'))}
            </Button>
          </div>

          {preview ? (
            <div className="rounded-lg border p-4">
              <h1 className="text-xl font-semibold">{lang === 'ar' ? form.titleAr : form.titleEn}</h1>
              <HelpRichText html={content} />
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>{t('helpAdmin.titleAr')}</Label><Input value={form.titleAr} onChange={(e) => set('titleAr', e.target.value)} /></div>
                <div className="space-y-1"><Label>{t('helpAdmin.titleEn')}</Label><Input value={form.titleEn} onChange={(e) => set('titleEn', e.target.value)} /></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>{t('helpAdmin.category')}</Label>
                  <Select value={form.categoryId} onValueChange={(value) => set('categoryId', value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(categories ?? []).map((category) => (
                        <SelectItem key={category.id} value={category.id}>{category.nameAr}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>{t('helpAdmin.slug')}</Label><Input dir="ltr" value={form.slug} onChange={(e) => set('slug', e.target.value)} /></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1"><Label>{t('helpAdmin.articleType')}</Label>
                  <Select value={form.articleType} onValueChange={(value) => set('articleType', value as HelpArticleInput['articleType'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['OVERVIEW', 'STEP_BY_STEP', 'FAQ', 'TROUBLESHOOTING', 'POLICY', 'REFERENCE'] as const).map((type) => (
                        <SelectItem key={type} value={type}>{t(`help.articleType.${type}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>{t('helpAdmin.difficulty')}</Label>
                  <Select value={form.difficulty} onValueChange={(value) => set('difficulty', value as HelpArticleInput['difficulty'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['BASIC', 'INTERMEDIATE', 'ADVANCED'] as const).map((level) => (
                        <SelectItem key={level} value={level}>{t(`help.difficulty.${level}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>{t('helpAdmin.readingMinutes')}</Label>
                  <Input type="number" min={0} value={form.estimatedReadingMinutes ?? 3} onChange={(e) => set('estimatedReadingMinutes', Number(e.target.value))} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>{t('helpAdmin.summaryAr')}</Label><Textarea value={form.summaryAr ?? ''} onChange={(e) => set('summaryAr', e.target.value)} /></div>
                <div className="space-y-1"><Label>{t('helpAdmin.summaryEn')}</Label><Textarea value={form.summaryEn ?? ''} onChange={(e) => set('summaryEn', e.target.value)} /></div>
              </div>
              <div className="space-y-1">
                <Label>{lang === 'ar' ? t('helpAdmin.contentAr') : t('helpAdmin.contentEn')}</Label>
                <Textarea className="min-h-48 font-mono text-xs" value={content} onChange={(e) => setContent(e.target.value)} />
                <p className="text-xs text-muted-foreground">{t('helpAdmin.contentHint')}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>{t('helpAdmin.featureKey')}</Label><Input dir="ltr" value={form.featureKey ?? ''} onChange={(e) => set('featureKey', e.target.value || null)} /></div>
                <div className="space-y-1"><Label>{t('helpAdmin.routePatterns')}</Label>
                  <Input dir="ltr" value={(form.routePatterns ?? []).join('\n')} onChange={(e) => set('routePatterns', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))} />
                  <p className="text-xs text-muted-foreground">{t('helpAdmin.routePatternsHint')}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>{t('helpAdmin.keywords')}</Label>
                  <Input value={(form.keywords ?? []).join(', ')} onChange={(e) => set('keywords', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
                  <p className="text-xs text-muted-foreground">{t('helpAdmin.keywordsHint')}</p>
                </div>
                <div className="space-y-1"><Label>{t('helpAdmin.allowedRoles')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {(['ADMIN', 'MANAGER', 'AGENT'] as const).map((role) => {
                      const selected = (form.allowedRoles ?? []).includes(role);
                      return (
                        <Button key={role} type="button" size="sm" variant={selected ? 'default' : 'outline'}
                          onClick={() => set('allowedRoles', selected ? (form.allowedRoles ?? []).filter((r) => r !== role) : [...(form.allowedRoles ?? []), role])}>
                          {ROLE_LABELS[role]}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isFeatured ?? false} onChange={(e) => set('isFeatured', e.target.checked)} />
                  {t('helpAdmin.featured')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isContextual ?? true} onChange={(e) => set('isContextual', e.target.checked)} />
                  {t('helpAdmin.contextual')}
                </label>
                <div className="flex items-center gap-2 text-sm">
                  <Label>{t('helpAdmin.sortOrder')}</Label>
                  <Input type="number" className="w-20" value={form.sortOrder ?? 0} onChange={(e) => set('sortOrder', Number(e.target.value))} />
                </div>
              </div>
              <div className="space-y-1"><Label>{t('helpAdmin.changeSummary')}</Label><Input value={form.changeSummary ?? ''} onChange={(e) => set('changeSummary', e.target.value)} /></div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('helpAdmin.cancel')}</Button>
          <Button variant="secondary" onClick={() => void handleSave(false)} disabled={create.isPending || update.isPending}>
            {t('helpAdmin.saveDraft')}
          </Button>
          <Button onClick={() => void handleSave(true)} disabled={create.isPending || update.isPending}>
            {t('helpAdmin.publish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VersionsDialog({ articleId, open, onOpenChange }: {
  articleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const versions = useAdminHelpVersions(articleId ?? '');
  const restore = useRestoreHelpVersion();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('helpAdmin.versions')}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        {(versions.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('helpAdmin.noVersions')}</p>
        ) : (
          <ul className="space-y-2">
            {(versions.data ?? []).map((version) => (
              <li key={version.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{version.changeSummary || '—'}</p>
                  <p className="text-xs text-muted-foreground">{t('helpAdmin.versionDate')}: {new Date(version.createdAt).toLocaleString()}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => articleId && void restore.mutateAsync({ articleId, versionId: version.id })}>
                  <RefreshCw className="h-3.5 w-3.5" /> {t('helpAdmin.restoreVersion')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Feedback ----------

function FeedbackTab() {
  const { t } = useTranslation();
  const feedback = useAdminHelpFeedback({ page: 1, pageSize: 50 });

  return (
    <Card>
      <CardContent className="pt-6">
        {(feedback.data?.items ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('helpAdmin.emptyFeedback')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('help.articleType.OVERVIEW')}</TableHead>
                <TableHead>{t('help.wasHelpful')}</TableHead>
                <TableHead>{t('help.commentPlaceholder')}</TableHead>
                <TableHead>{t('helpAdmin.versionDate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(feedback.data?.items ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.articleTitle}</TableCell>
                  <TableCell>
                    <Badge variant={item.wasHelpful ? 'success' : 'destructive'}>{item.wasHelpful ? t('help.yes') : t('help.no')}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.comment || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Analytics ----------

function AnalyticsTab() {
  const { t } = useTranslation();
  const analytics = useAdminHelpAnalytics();

  if (analytics.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  const data = analytics.data;
  if (!data) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t('common.error')}</p>;
  }

  const statCards = [
    { label: t('helpAdmin.totalViews'), value: data.totalViews },
    { label: t('helpAdmin.totalFeedback'), value: data.totalFeedback },
    { label: t('helpAdmin.searchQueries'), value: data.searchQueries },
    { label: t('helpAdmin.noResultQueries'), value: data.noResultQueries },
  ];

  const renderArticleRows = (rows: Array<{ articleId: string; title: string; views: number; helpfulPercent: number | null; notHelpful?: number }>) =>
    rows.length === 0 ? (
      <p className="py-4 text-center text-sm text-muted-foreground">—</p>
    ) : (
      <Table>
        <TableHeader>
          <TableRow><TableHead>{t('helpAdmin.category')}</TableHead><TableHead>{t('helpAdmin.views')}</TableHead><TableHead>{t('helpAdmin.helpfulPercent')}</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.articleId}>
              <TableCell className="font-medium">{row.title}</TableCell>
              <TableCell>{row.views}</TableCell>
              <TableCell>{row.helpfulPercent === null ? '—' : `${row.helpfulPercent}%`}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
            </CardHeader>
            <CardContent><div className="text-2xl font-semibold tabular-nums">{card.value}</div></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{t('helpAdmin.topArticles')}</CardTitle></CardHeader>
          <CardContent>{renderArticleRows(data.topArticles)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t('helpAdmin.worstArticles')}</CardTitle></CardHeader>
          <CardContent>{renderArticleRows(data.worstArticles)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('helpAdmin.recentNoResultSearches')}</CardTitle></CardHeader>
        <CardContent>
          {data.recentNoResultSearches.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">—</p>
          ) : (
            <ul className="space-y-1">
              {data.recentNoResultSearches.map((item) => (
                <li key={item.query} className="flex items-center justify-between text-sm">
                  <span className="font-mono">{item.query}</span>
                  <span className="text-muted-foreground">{item.count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
