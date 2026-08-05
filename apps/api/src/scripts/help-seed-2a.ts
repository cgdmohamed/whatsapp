import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { parseApiEnv } from '@wa/config';
import * as schema from '../db/schema';
import { helpArticles, helpCategories } from '../db/schema';
import { sanitizeHelpHtml } from '../modules/help/help-sanitize';

type SeedHelpDb = NodePgDatabase<typeof schema>;

const AR = (text: string) => `<p>${text}</p>`;
const EN = (text: string) => `<p>${text}</p>`;

const ARTICLES = [
  {
    categorySlug: 'message-templates',
    slug: 'previewing-a-whatsapp-template',
    titleAr: 'معاينة قالب واتساب',
    titleEn: 'Previewing a WhatsApp template',
    summaryAr: 'كيف تعاين القالب أثناء الإنشاء وقبل الإرسال.',
    summaryEn: 'How to preview a template while creating it and before sending.',
    keywords: ['معاينة', 'preview', 'قالب'],
    routePatterns: ['/templates'], featureKey: 'templates',
    sortOrder: 20,
    contentAr: AR('أثناء إنشاء القالب يظهر معاينة حية تشبه واتساب بجانب النموذج، تعرض الرأس والنص والتذييل والأزرار. أدخل قيمًا نموذجية للمتغيرات لمشاهدة النتيجة. المعاينة تقريبية ولا تُرسل أي رسالة فعلية.'),
    contentEn: EN('While creating a template a live WhatsApp-like preview appears next to the form, showing the header, body, footer and buttons. Enter sample values for the variables to see the result. The preview is approximate and never sends a real message.'),
  },
  {
    categorySlug: 'message-templates',
    slug: 'understanding-template-variables',
    titleAr: 'فهم متغيرات القوالب',
    titleEn: 'Understanding template variables',
    summaryAr: 'ما هي {{1}} وكيف تُحل من البيانات.',
    summaryEn: 'What {{1}} are and how they are resolved from data.',
    keywords: ['متغير', 'variable', 'قالب'],
    routePatterns: ['/templates', '/campaigns'], featureKey: 'templates',
    sortOrder: 21,
    contentAr: AR('المتغيرات مثل {{1}} و{{2}} تُستبدل ببيانات المستلم (الاسم، رقم الطلب...). تُربط بحقول جهات الاتصال في الحملة. المتغير بلا قيمة يظهر مميزًا بلون وتحذير واضح حتى لا يُرسل نص {{1}} للمستلم.'),
    contentEn: EN('Variables such as {{1}} and {{2}} are replaced with recipient data (name, order number...). They are mapped to contact fields in a campaign. A variable with no value is highlighted with a clear warning so {{1}} is never sent to a recipient.'),
  },
  {
    categorySlug: 'campaigns',
    slug: 'previewing-a-campaign-for-recipients',
    titleAr: 'معاينة الحملة لمستلمين مختلفين',
    titleEn: 'Previewing a campaign for different recipients',
    summaryAr: 'اختبر الرسالة على مستلمين فعليين قبل الإرسال.',
    summaryEn: 'Test the message on real recipients before sending.',
    keywords: ['معاينة', 'preview', 'مستلم', 'recipient'],
    routePatterns: ['/campaigns'], featureKey: 'campaigns',
    sortOrder: 22,
    contentAr: AR('في منشئ الحملة يمكنك التنقل بين المستلمين المؤهلين وغير المؤهلين ومعاينة الرسالة بقيم كل مستلم. تظهر الأهلية وحالة الموافقة والاستبعاد وحالة حل المتغيرات. هذه معاينة عينة ولا تغني عن الفحص المسبق الكامل.'),
    contentEn: EN('In the campaign builder you can move between eligible and ineligible recipients and preview the message with each recipient’s values. Eligibility, consent, suppression and variable-resolution state are shown. This is a sample preview and does not replace full preflight validation.'),
  },
  {
    categorySlug: 'campaigns',
    slug: 'resolving-missing-variables',
    titleAr: 'حل المتغيرات الناقصة',
    titleEn: 'Resolving missing variables',
    summaryAr: 'اربط الحقل المصدر أو استخدم قيمة احتياطية.',
    summaryEn: 'Map the source field or use a fallback value.',
    keywords: ['متغير', 'variable', 'ناقص', 'missing'],
    routePatterns: ['/campaigns'], featureKey: 'campaigns',
    sortOrder: 23,
    contentAr: AR('عندما يظهر متغير ناقص في المعاينة، اربط حقل مصدر من جهات الاتصال، أو أدخل قيمة احتياطية، أو صحّح بيانات المستلم. تُمنع الحملات ذات المتغيرات الناقصة من الإطلاق عبر الفحص المسبق.'),
    contentEn: EN('When a variable appears missing in the preview, map a source contact field, enter a fallback value, or fix the recipient data. Campaigns with missing variables are blocked from launching by preflight validation.'),
  },
  {
    categorySlug: 'message-templates',
    slug: 'previewing-buttons-and-dynamic-links',
    titleAr: 'معاينة الأزرار والروابط الديناميكية',
    titleEn: 'Previewing buttons and dynamic links',
    summaryAr: 'راجع أزرار الرد السريع والروابط قبل الإرسال.',
    summaryEn: 'Review quick-reply buttons and links before sending.',
    keywords: ['زر', 'button', 'رابط', 'link'],
    routePatterns: ['/templates'], featureKey: 'templates',
    sortOrder: 24,
    contentAr: AR('تعرض المعاينة أزرار الرد السريع وروابط URL وأرقام الهاتف بنفس ترتيب القالب. للروابط الديناميكية مثل https://example.com/{{1}} يُعرض الرابط النهائي بعد حل المتغير، مع تنبيه إذا بقي متغير بلا قيمة. الأزرار في المعاينة لا تُفعّل أي إجراء حقيقي.'),
    contentEn: EN('The preview shows quick-reply buttons, URL links and phone numbers in the same order as the template. For dynamic links such as https://example.com/{{1}} the final URL is shown after resolving variables, with a warning if a variable remains empty. Preview buttons never trigger real actions.'),
  },
  {
    categorySlug: 'getting-started',
    slug: 'understanding-preview-limitations',
    titleAr: 'فهم حدود المعاينة',
    titleEn: 'Understanding preview limitations',
    summaryAr: 'المعاينة تقريبية ولا تعادل فحص Meta الفعلي.',
    summaryEn: 'The preview is approximate and not a real Meta check.',
    keywords: ['حدود', 'limitations', 'معاينة'],
    routePatterns: ['/templates', '/campaigns', '/inbox'], featureKey: 'templates',
    sortOrder: 25,
    contentAr: AR('المعاينة تقريبية وقد تختلف حسب إصدار واتساب والجهاز. التحذيرات المرئية (طول النص، النواقص) إرشادية فقط، بينما التحقق الفعلي من القالب يتم بواسطة Meta. لا تُرسل الرسائل من المعاينة أبدًا.'),
    contentEn: EN('The preview is approximate and may vary by WhatsApp version and device. Visual warnings (long text, missing values) are guidance only; real template validation is performed by Meta. Messages are never sent from the preview.'),
  },
];

export async function seedHelpCenter2a(db: SeedHelpDb): Promise<void> {
  const categories = await db.select().from(helpCategories);
  const categoryIdBySlug = new Map(categories.map((category) => [category.slug, category.id]));

  let inserted = 0;
  for (const article of ARTICLES) {
    const categoryId = categoryIdBySlug.get(article.categorySlug);
    if (!categoryId) {
      console.warn(`Unknown category ${article.categorySlug}; skipping ${article.slug}`);
      continue;
    }
    const exists = await db.query.helpArticles.findFirst({ where: eq(helpArticles.slug, article.slug) });
    if (exists) continue;
    await db.insert(helpArticles).values({
      categoryId,
      slug: article.slug,
      titleAr: article.titleAr,
      titleEn: article.titleEn,
      summaryAr: article.summaryAr,
      summaryEn: article.summaryEn,
      contentAr: sanitizeHelpHtml(article.contentAr),
      contentEn: sanitizeHelpHtml(article.contentEn),
      status: 'PUBLISHED',
      articleType: 'OVERVIEW',
      difficulty: 'BASIC',
      estimatedReadingMinutes: 2,
      allowedRoles: null,
      routePatterns: article.routePatterns ?? null,
      featureKey: article.featureKey ?? null,
      keywords: article.keywords ?? null,
      sortOrder: article.sortOrder,
      isFeatured: false,
      isContextual: true,
      publishedAt: new Date(),
    });
    inserted += 1;
  }
  console.log(`Help Center 2A: inserted ${inserted} articles.`);
}

async function main(): Promise<void> {
  const env = parseApiEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  await seedHelpCenter2a(db);
  await pool.end();
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
