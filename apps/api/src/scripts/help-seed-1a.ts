import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { parseApiEnv } from '@wa/config';
import { helpArticles, helpCategories } from '../db/schema';
import { sanitizeHelpHtml } from '../modules/help/help-sanitize';

interface ArticleSeed {
  categorySlug: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  contentAr: string;
  contentEn: string;
  routePatterns?: string[];
  featureKey?: string;
  keywords: string[];
  sortOrder: number;
}

const AR = (text: string) => `<p>${text}</p>`;
const EN = (text: string) => `<p>${text}</p>`;

const ARTICLES: ArticleSeed[] = [
  {
    categorySlug: 'getting-started', slug: 'recovering-a-forgotten-password',
    titleAr: 'استعادة كلمة مرور منسية', titleEn: 'Recovering a forgotten password',
    summaryAr: 'اطلب رابط استرداد عبر البريد الإلكتروني.', summaryEn: 'Request a password recovery link by email.',
    keywords: ['نسيت', 'forgot', 'كلمة مرور', 'password'],
    routePatterns: ['/forgot-password'], featureKey: 'auth',
    sortOrder: 1,
    contentAr: AR('افتح صفحة تسجيل الدخول واضغط «نسيت كلمة المرور». أدخل بريدك الإلكتروني؛ إذا وُجد حساب مؤهل سيصلك رابط استرداد. الرابط صالح لمرة واحدة ولفترة محدودة.'),
    contentEn: EN('Open the sign-in page and click “Forgot password”. Enter your email; if an eligible account exists you will receive a recovery link. The link is single-use and time-limited.'),
  },
  {
    categorySlug: 'users-permissions', slug: 'resetting-an-employee-password',
    titleAr: 'إعادة تعيين كلمة مرور موظف', titleEn: 'Resetting an employee password',
    summaryAr: 'أرسل رابط إعادة تعيين لمستخدم من لوحة المسؤول.', summaryEn: 'Send a reset link to a user from the admin area.',
    keywords: ['موظف', 'employee', 'إعادة تعيين', 'reset'],
    routePatterns: ['/users'], featureKey: 'users',
    sortOrder: 2,
    contentAr: AR('افتح «المستخدمون»، اختر المستخدم، ثم «إرسال رابط إعادة التعيين». يصلك للمستخدم رابط صالح لمرة واحدة. يفضَّل ألا يحدد المسؤول كلمة مرور بنفسه.'),
    contentEn: EN('Open “Users”, select the user, then “Send reset link”. The user receives a single-use link. Prefer not to set a password yourself.'),
  },
  {
    categorySlug: 'troubleshooting', slug: 'password-reset-link-expired',
    titleAr: 'انتهت صلاحية رابط إعادة التعيين', titleEn: 'Password reset link expired',
    summaryAr: 'اطلب رابطًا جديدًا عندما تنتهي الصلاحية.', summaryEn: 'Request a new link when one expires.',
    keywords: ['انتهت', 'expired', 'رابط', 'link'],
    routePatterns: ['/reset-password'], featureKey: 'auth',
    sortOrder: 3,
    contentAr: AR('روابط إعادة التعيين صالحة لمدة قصيرة (افتراضيًا 30 دقيقة) ولمرة واحدة. إذا انتهى الرابط أو استُخدم، اطلب رابطًا جديدًا من صفحة «نسيت كلمة المرور».'),
    contentEn: EN('Reset links are valid for a short time (30 minutes by default) and single-use. If a link expired or was used, request a new one from the “Forgot password” page.'),
  },
  {
    categorySlug: 'troubleshooting', slug: 'password-reset-email-not-received',
    titleAr: 'لم يصلك بريد إعادة التعيين', titleEn: 'Password reset email not received',
    summaryAr: 'تحقق من البريد العشوائي وإعدادات SMTP.', summaryEn: 'Check spam and SMTP settings.',
    keywords: ['لم يصلك', 'not received', 'بريد', 'email'],
    routePatterns: ['/forgot-password'], featureKey: 'auth',
    sortOrder: 4,
    contentAr: AR('تحقق من مجلد البريد العشوائي. تأكد أن البريد الإلكتروني للمنصة مفعّل في إعدادات البريد، واختبر اتصال SMTP من صفحة «إعدادات البريد». لا تكشف المنصة ما إذا كان البريد مسجلًا.'),
    contentEn: EN('Check the spam folder. Make sure the platform email is enabled in Email settings, and test the SMTP connection there. The platform does not reveal whether an email is registered.'),
  },
  {
    categorySlug: 'getting-started', slug: 'changing-your-password',
    titleAr: 'تغيير كلمة المرور', titleEn: 'Changing your password',
    summaryAr: 'حدّث كلمة مرورك من الملف الشخصي.', summaryEn: 'Update your password from your profile.',
    keywords: ['تغيير', 'change', 'كلمة مرور'],
    routePatterns: ['/profile', '/change-password'], featureKey: 'profile',
    sortOrder: 5,
    contentAr: AR('افتح قائمة المستخدم ثم «تغيير كلمة المرور». أدخل كلمة المرور الحالية ثم الجديدة مع تأكيدها. تُطبق سياسة كلمة المرور وتُلغى الجلسات الحالية.'),
    contentEn: EN('Open the user menu then “Change password”. Enter your current password, then the new one with confirmation. The password policy is applied and current sessions are revoked.'),
  },
  {
    categorySlug: 'users-permissions', slug: 'revoking-active-sessions',
    titleAr: 'إلغاء الجلسات النشطة', titleEn: 'Revoking active sessions',
    summaryAr: 'تسجيل الخروج من جميع الأجهزة.', summaryEn: 'Signing out of all devices.',
    keywords: ['جلسات', 'sessions', 'إلغاء'],
    routePatterns: ['/profile', '/users'], featureKey: 'users',
    sortOrder: 6,
    contentAr: AR('استخدم «إلغاء الجلسات» لتسجيل الخروج من كل الأجهزة عند الاشتباه باختراق. سيُطلب منك تسجيل الدخول مجددًا وتصلك رسالة تأكيد.'),
    contentEn: EN('Use “Revoke sessions” to sign out of every device when you suspect a compromise. You will need to sign in again and a confirmation is sent.'),
  },
  {
    categorySlug: 'security-policies', slug: 'configuring-transactional-email',
    titleAr: 'إعداد البريد الإلكتروني للنظام', titleEn: 'Configuring transactional email',
    summaryAr: 'ضبط SMTP في «إعدادات البريد».', summaryEn: 'Set up SMTP in Email settings.',
    keywords: ['بريد', 'email', 'smtp', 'إعداد'],
    routePatterns: ['/settings/email'], featureKey: 'settings',
    sortOrder: 7,
    contentAr: AR('في «إعدادات البريد» أدخل خادم SMTP وبيانات الاعتماد والبريد المرسل. كلمة المرور تُخزَّن مشفرة ولا تُعرض. فعّل البريد ثم اختبر الاتصال وأرسل بريدًا تجريبيًا.'),
    contentEn: EN('In Email settings enter the SMTP host, credentials and from address. The password is stored encrypted and never shown. Enable email, test the connection and send a test message.'),
  },
  {
    categorySlug: 'security-policies', slug: 'testing-smtp-settings',
    titleAr: 'اختبار إعدادات SMTP', titleEn: 'Testing SMTP settings',
    summaryAr: 'تحقق من الاتصال قبل الاعتماد على البريد.', summaryEn: 'Verify connectivity before relying on email.',
    keywords: ['اختبار', 'test', 'smtp'],
    routePatterns: ['/settings/email'], featureKey: 'settings',
    sortOrder: 8,
    contentAr: AR('اضغط «اختبار اتصال SMTP» للتحقق، ثم أرسل «بريد اختبار» إلى بريدك. يظهر آخر اختبار وتاريخ آخر رسالة في صفحة الإعدادات.'),
    contentEn: EN('Click “Test SMTP connection” to verify, then send a “Test email” to your own address. The last test and last message dates are shown on the settings page.'),
  },
  {
    categorySlug: 'getting-started', slug: 'managing-notification-preferences',
    titleAr: 'إدارة تفضيلات الإشعارات', titleEn: 'Managing notification preferences',
    summaryAr: 'اختر الإشعارات التي تصلك.', summaryEn: 'Choose which notifications you receive.',
    keywords: ['إشعارات', 'notifications', 'تفضيلات'],
    routePatterns: ['/profile', '/settings/notifications'], featureKey: 'profile',
    sortOrder: 9,
    contentAr: AR('يمكنك ضبط إشعارات البريد والداخلية لكل تصنيف. لا يمكن تعطيل تنبيهات الأمان مثل تغيير كلمة المرور وإعادة التعيين وإيقاف الحساب.'),
    contentEn: EN('You can adjust email and in-app notifications per category. Security alerts such as password changes, resets and account suspension cannot be disabled.'),
  },
  {
    categorySlug: 'security-policies', slug: 'understanding-security-notifications',
    titleAr: 'فهم الإشعارات الأمنية', titleEn: 'Understanding security notifications',
    summaryAr: 'ماذا تعني تنبيهات تسجيل الدخول والجلسات.', summaryEn: 'What login and session alerts mean.',
    keywords: ['أمان', 'security', 'إشعارات'],
    routePatterns: ['/profile'], featureKey: 'profile',
    sortOrder: 10,
    contentAr: AR('ترسل المنصة إشعارات عند تغيير كلمة المرور وإعادة تعيينها وإلغاء الجلسات وتسجيل دخول جديد. إذا لم تكن أنت من نفّذ الإجراء تواصل مع المسؤول فورًا.'),
    contentEn: EN('The platform notifies you on password changes, resets, session revocation and new sign-ins. If you did not perform the action, contact your administrator immediately.'),
  },
  {
    categorySlug: 'campaigns', slug: 'understanding-campaign-email-alerts',
    titleAr: 'فهم تنبيهات الحملات', titleEn: 'Understanding campaign email alerts',
    summaryAr: 'إشعارات الحالة والفشل للمسؤولين.', summaryEn: 'Status and failure alerts for administrators.',
    keywords: ['حملة', 'campaign', 'تنبيه', 'alert'],
    routePatterns: ['/campaigns'], featureKey: 'campaigns',
    sortOrder: 11,
    contentAr: AR('تُرسل إشعارات للمسؤولين والمديرين عند بدء الحملة واكتمالها وفشلها وإيقافها تلقائيًا، مع أعداد المرسل والمسلّم والفاشل.'),
    contentEn: EN('Admins and managers receive alerts when a campaign starts, completes, fails or pauses automatically, including sent, delivered and failed counts.'),
  },
  {
    categorySlug: 'security-policies', slug: 'configuring-daily-management-summary',
    titleAr: 'إعداد الملخص اليومي', titleEn: 'Configuring the daily management summary',
    summaryAr: 'ملخص إدارة يُرسل يوميًا في وقت محدد.', summaryEn: 'A management summary sent daily at a set time.',
    keywords: ['ملخص', 'summary', 'يومي'],
    routePatterns: ['/settings/email'], featureKey: 'settings',
    sortOrder: 12,
    contentAr: AR('من «إعدادات البريد» فعّل الملخص اليومي وحدد وقت التسليم (بتوقيت القاهرة) والمستلمين. يُرسل ملخص واحد لكل مستلم يوميًا.'),
    contentEn: EN('From Email settings enable the daily summary, set the delivery time (Africa/Cairo) and recipients. One summary is sent per recipient each day.'),
  },
];

async function main(): Promise<void> {
  const env = parseApiEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool, { schema: { helpCategories, helpArticles } });

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
      articleType: 'STEP_BY_STEP',
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
  console.log(`Help Center 1A: inserted ${inserted} articles.`);
  await pool.end();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
