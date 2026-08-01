import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { parseApiEnv } from '@wa/config';
import { helpArticles, helpCategories } from '../db/schema';
import { sanitizeHelpHtml } from '../modules/help/help-sanitize';

interface CategorySeed {
  slug: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  icon: string;
  sortOrder: number;
}

interface ArticleSeed {
  categorySlug: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  contentAr: string;
  contentEn: string;
  articleType: 'OVERVIEW' | 'STEP_BY_STEP' | 'FAQ' | 'TROUBLESHOOTING' | 'POLICY' | 'REFERENCE';
  difficulty: 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';
  allowedRoles?: ('ADMIN' | 'MANAGER' | 'AGENT')[];
  routePatterns?: string[];
  featureKey?: string;
  keywords: string[];
  isFeatured?: boolean;
  sortOrder: number;
}

const CATEGORIES: CategorySeed[] = [
  { slug: 'getting-started', nameAr: 'بدء الاستخدام', nameEn: 'Getting Started', descriptionAr: 'مقدمة المنصة وتسجيل الدخول والأدوار الأساسية.', descriptionEn: 'Platform introduction, logging in, and core roles.', icon: 'Rocket', sortOrder: 1 },
  { slug: 'whatsapp-configuration', nameAr: 'إعداد واتساب', nameEn: 'WhatsApp Configuration', descriptionAr: 'ربط Meta WhatsApp Cloud API وإعداد الخطوط والويب هوك.', descriptionEn: 'Connecting Meta WhatsApp Cloud API, phone numbers, and webhooks.', icon: 'Settings2', sortOrder: 2 },
  { slug: 'contacts', nameAr: 'جهات الاتصال', nameEn: 'Contacts', descriptionAr: 'إنشاء جهات الاتصال وإدارتها واستيرادها وتصديرها.', descriptionEn: 'Creating, managing, importing and exporting contacts.', icon: 'Contact', sortOrder: 3 },
  { slug: 'consent-suppression', nameAr: 'الموافقة والاستبعاد', nameEn: 'Consent and Suppression', descriptionAr: 'فهم الاشتراك والإلغاء وقوائم الاستبعاد.', descriptionEn: 'Understanding opt-in, opt-out and suppression lists.', icon: 'ShieldCheck', sortOrder: 4 },
  { slug: 'lists-tags', nameAr: 'القوائم والوسوم', nameEn: 'Lists and Tags', descriptionAr: 'تنظيم الجمهور عبر القوائم والوسوم.', descriptionEn: 'Organizing audiences with lists and tags.', icon: 'Tags', sortOrder: 5 },
  { slug: 'message-templates', nameAr: 'قوالب الرسائل', nameEn: 'Message Templates', descriptionAr: 'مزامنة وإنشاء قوالب رسائل واتساب.', descriptionEn: 'Synchronizing and creating WhatsApp message templates.', icon: 'FileText', sortOrder: 6 },
  { slug: 'campaigns', nameAr: 'الحملات', nameEn: 'Campaigns', descriptionAr: 'إنشاء الحملات وتحديد الجمهور والجدولة والإطلاق.', descriptionEn: 'Creating campaigns, audiences, scheduling and launching.', icon: 'Megaphone', sortOrder: 7 },
  { slug: 'campaign-results', nameAr: 'نتائج الحملات', nameEn: 'Campaign Results', descriptionAr: 'قراءة حالات الإرسال والتسليم والفشل والنسب.', descriptionEn: 'Reading delivery statuses, failures and percentages.', icon: 'BarChart3', sortOrder: 8 },
  { slug: 'inbox', nameAr: 'البريد الوارد', nameEn: 'Team Inbox', descriptionAr: 'استخدام البريد الوارد المشترك والردود والملاحظات.', descriptionEn: 'Using the shared inbox, replies and internal notes.', icon: 'Inbox', sortOrder: 9 },
  { slug: 'reports', nameAr: 'التقارير', nameEn: 'Reports', descriptionAr: 'لوحة المعلومات والتقارير والتصدير.', descriptionEn: 'Dashboard, reports and exports.', icon: 'Database', sortOrder: 10 },
  { slug: 'users-permissions', nameAr: 'المستخدمون والصلاحيات', nameEn: 'Users and Permissions', descriptionAr: 'إدارة المستخدمين والأدوار وصلاحيات كل دور.', descriptionEn: 'Managing users, roles and each role’s permissions.', icon: 'Users', sortOrder: 11 },
  { slug: 'troubleshooting', nameAr: 'استكشاف الأخطاء', nameEn: 'Troubleshooting', descriptionAr: 'حلول للمشاكل التشغيلية الشائعة.', descriptionEn: 'Solutions to common operational problems.', icon: 'Wrench', sortOrder: 12 },
  { slug: 'security-policies', nameAr: 'الأمان والسياسات', nameEn: 'Security and Policies', descriptionAr: 'حماية البيانات وبيانات الاعتماد ومتطلبات الامتثال.', descriptionEn: 'Data protection, credentials and compliance requirements.', icon: 'Lock', sortOrder: 13 },
];

const CRITICAL_ARTICLES: ArticleSeed[] = [
  {
    categorySlug: 'getting-started',
    slug: 'platform-overview',
    titleAr: 'نظرة عامة على المنصة',
    titleEn: 'Platform overview',
    summaryAr: 'ما هي المنصة، وماذا تفعل، وكيف تعمل الأقسام الرئيسية معًا.',
    summaryEn: 'What the platform is, what it does, and how the main sections work together.',
    keywords: ['نظرة عامة', 'overview', 'منصة', 'platform'],
    articleType: 'OVERVIEW',
    difficulty: 'BASIC',
    featureKey: 'dashboard',
    routePatterns: ['/'],
    isFeatured: true,
    sortOrder: 1,
    contentAr: `
<p>مرحبًا بك في <strong>منصة إدارة حملات واتساب</strong> — نظام مستضاف ذاتيًا لإرسال حملات رسائل واتساب وإدارة بريد وارد موحد لفريقك، مبني على Meta WhatsApp Business Cloud API.</p>
<h2>ماذا تفعل المنصة؟</h2>
<ul>
<li><strong>الحملات</strong> — إرسال رسائل من قوالب معتمدة لجماهير محددة، مع جدولة ومتابعة لحالة كل مستلم.</li>
<li><strong>جهات الاتصال</strong> — إدارة الجمهور واستيراد ملفات Excel ومعالجة المكررات وحالة الاشتراك.</li>
<li><strong>البريد الوارد</strong> — محادثات العملاء وإسنادها للوكلاء وملاحظات داخلية وردود سريعة.</li>
<li><strong>التقارير</strong> — لوحة معلومات ومؤشرات أداء وتصدير تقارير.</li>
</ul>
<h2>الأدوار الثلاثة</h2>
<table><thead><tr><th>الدور</th><th>الوصول</th></tr></thead><tbody>
<tr><td>المسؤول ADMIN</td><td>كل شيء، بما فيها الإعدادات والمستخدمون وسجلات التدقيق.</td></tr>
<tr><td>المدير MANAGER</td><td>إدارة جهات الاتصال والحملات والتقارير والمستخدمين (غير المسؤولين).</td></tr>
<tr><td>الوكيل AGENT</td><td>العمل على البريد الوارد وعرض جهات الاتصال والملفات الشخصية.</td></tr>
</tbody></table>
<div class="permission">للوصول الكامل تحتاج دور ADMIN. اطلب من مديرك ترقية دورك عند الحاجة.</div>
<div class="tip">ابدأ بمراجعة «المسار السريع» في لوحة المعلومات لإكمال الإعداد الأساسي خطوة بخطوة.</div>`,
    contentEn: `
<p>Welcome to the <strong>WhatsApp Campaign Manager</strong> — a self-hosted platform for sending WhatsApp campaigns and running a unified team inbox, built on the Meta WhatsApp Business Cloud API.</p>
<h2>What the platform does</h2>
<ul>
<li><strong>Campaigns</strong> — send messages from approved templates to targeted audiences, with scheduling and per-recipient status tracking.</li>
<li><strong>Contacts</strong> — manage your audience, import Excel files, handle duplicates and consent state.</li>
<li><strong>Inbox</strong> — customer conversations, agent assignment, internal notes, and quick replies.</li>
<li><strong>Reports</strong> — dashboard KPIs and exportable reports.</li>
</ul>
<h2>The three roles</h2>
<table><thead><tr><th>Role</th><th>Access</th></tr></thead><tbody>
<tr><td>ADMIN</td><td>Everything, including settings, users, and audit logs.</td></tr>
<tr><td>MANAGER</td><td>Contacts, campaigns, reports, and non-admin users.</td></tr>
<tr><td>AGENT</td><td>Inbox work, contact viewing, and their own profile.</td></tr>
</tbody></table>
<div class="permission">Full access requires the ADMIN role. Ask your manager to upgrade your role if needed.</div>
<div class="tip">Start with the onboarding checklist on the dashboard to complete the essential setup step by step.</div>`,
  },
  {
    categorySlug: 'whatsapp-configuration',
    slug: 'connecting-meta-whatsapp-cloud-api',
    titleAr: 'ربط Meta WhatsApp Cloud API',
    titleEn: 'Connecting Meta WhatsApp Cloud API',
    summaryAr: 'الخطوات الكاملة لإضافة بيانات اعتماد Meta واختبار الاتصال وربط رقم الهاتف.',
    summaryEn: 'Full steps to add Meta credentials, test the connection, and link a phone number.',
    keywords: ['meta', 'واتساب', 'whatsapp', 'ربط', 'connect', 'api', 'بيانات اعتماد'],
    articleType: 'STEP_BY_STEP',
    difficulty: 'INTERMEDIATE',
    featureKey: 'whatsapp',
    routePatterns: ['/whatsapp'],
    isFeatured: true,
    sortOrder: 1,
    contentAr: `
<div class="goal">الهدف: ربط حساب Meta WhatsApp Business Cloud API بالمنصة حتى تتمكن من إرسال الرسائل واستقبالها.</div>
<h2>قبل البدء</h2>
<ul>
<li>حساب Meta Business Manager نشط.</li>
<li>رقم هاتف واتساب Business معرّف (غير مرتبط بحساب واتساب شخصي).</li>
<li>تطبيق Meta للرسائل مع الحصول على App ID و App Secret.</li>
</ul>
<div class="permission">الإجراء متاح لدور ADMIN فقط.</div>
<h2>الخطوات</h2>
<ol>
<li>افتح <strong>واتساب</strong> من القائمة الجانبية.</li>
<li>أدخل <strong>معرّف التطبيق App ID</strong> و <strong>سر التطبيق App Secret</strong> و <strong>رمز التحقق Verify Token</strong>.</li>
<li>أدخل رقم الهاتف والمعرّفات المطلوبة (WABA ID و Phone Number ID) إن توفرت.</li>
<li>اضغط <strong>حفظ</strong> ثم <strong>اختبار الاتصال</strong>.</li>
<li>انتظر نتيجة الاختبار: <span class="success">تم الاتصال بنجاح</span> تعني أن كل شيء جاهز.</li>
<li>اضغط <strong>مزامنة الأرقام</strong> ثم <strong>مزامنة القوالب</strong>.</li>
</ol>
<div class="success">النتيجة المتوقعة: ظهور الحالة «متصل» ورقم هاتف واحد نشط على الأقل.</div>
<div class="warning">لا تشارك App Secret أو رمز الوصول مع أي شخص. تُخزَّن البيانات مشفّرة داخل المنصة.</div>
<h2>مشاكل شائعة</h2>
<div class="mistake">رمز وصول تالف أو منتهي الصلاحية — راجع «استكشاف أخطاء رمز وصول Meta».</div>
<div class="mistake">رقم الهاتف مرتبط بحساب شخصي — يجب تحويله إلى واتساب Business أولًا.</div>`,
    contentEn: `
<div class="goal">Goal: connect your Meta WhatsApp Business Cloud API account so the platform can send and receive messages.</div>
<h2>Before you start</h2>
<ul>
<li>An active Meta Business Manager account.</li>
<li>A verified WhatsApp Business phone number (not linked to a personal account).</li>
<li>A Meta messaging app with the App ID and App Secret.</li>
</ul>
<div class="permission">This action is available to the ADMIN role only.</div>
<h2>Steps</h2>
<ol>
<li>Open <strong>WhatsApp</strong> from the side menu.</li>
<li>Enter the <strong>App ID</strong>, <strong>App Secret</strong>, and <strong>Verify Token</strong>.</li>
<li>Enter your phone number and identifiers (WABA ID, Phone Number ID) if available.</li>
<li>Click <strong>Save</strong>, then <strong>Test connection</strong>.</li>
<li>Wait for the result — <span class="success">Connected successfully</span> means everything is ready.</li>
<li>Click <strong>Sync numbers</strong>, then <strong>Sync templates</strong>.</li>
</ol>
<div class="success">Expected result: status “Connected” and at least one active phone number.</div>
<div class="warning">Never share your App Secret or access token. Credentials are stored encrypted in the platform.</div>
<h2>Common problems</h2>
<div class="mistake">Malformed or expired access token — see “Troubleshooting an expired Meta access token”.</div>
<div class="mistake">Phone number linked to a personal account — convert it to WhatsApp Business first.</div>`,
  },
];

const OTHER_ARTICLES: ArticleSeed[] = [
  { categorySlug: 'getting-started', slug: 'logging-in', titleAr: 'تسجيل الدخول', titleEn: 'Logging in', summaryAr: 'كيفية الدخول إلى المنصة واستعادة الوصول.', summaryEn: 'How to sign in and regain access.', keywords: ['دخول', 'login', 'تسجيل'], articleType: 'OVERVIEW', difficulty: 'BASIC', featureKey: 'dashboard', routePatterns: ['/login'], sortOrder: 2, contentAr: '<p>افتح رابط المنصة، وأدخل بريدك الإلكتروني وكلمة المرور.</p><div class="warning">بعد عدة محاولات خاطئة قد يتم إيقاف تسجيل الدخول مؤقتًا. انتظر ثم أعد المحاولة.</div>', contentEn: '<p>Open the platform URL and enter your email and password.</p><div class="warning">After several failed attempts, sign-in is temporarily blocked. Wait and try again.</div>' },
  { categorySlug: 'getting-started', slug: 'changing-language', titleAr: 'تغيير اللغة', titleEn: 'Changing the language', summaryAr: 'التبديل بين العربية والإنجليزية.', summaryEn: 'Switch between Arabic and English.', keywords: ['لغة', 'language', 'عربية', 'english'], articleType: 'OVERVIEW', difficulty: 'BASIC', sortOrder: 3, contentAr: '<p>اضغط على اسم اللغة في الشريط العلوي واختر اللغة المطلوبة. يُحفظ اختيارك تلقائيًا على جهازك.</p>', contentEn: '<p>Click the language name in the top bar and choose your language. Your choice is saved automatically.</p>' },
  { categorySlug: 'getting-started', slug: 'understanding-roles', titleAr: 'فهم الأدوار والصلاحيات', titleEn: 'Understanding roles and permissions', summaryAr: 'الفرق بين المسؤول والمدير والوكيل.', summaryEn: 'The difference between ADMIN, MANAGER and AGENT.', keywords: ['أدوار', 'roles', 'صلاحيات', 'permissions'], articleType: 'REFERENCE', difficulty: 'BASIC', sortOrder: 4, contentAr: '<p>المسؤول يدير كل شيء. المدير يدير المحتوى والمستخدمين غير المسؤولين. الوكيل يعمل على البريد الوارد فقط.</p>', contentEn: '<p>ADMIN manages everything. MANAGER manages content and non-admin users. AGENT only works on the inbox.</p>' },
  { categorySlug: 'getting-started', slug: 'navigating-dashboard', titleAr: 'التنقل في لوحة المعلومات', titleEn: 'Navigating the dashboard', summaryAr: 'شرح مؤشرات لوحة المعلومات والمدى الزمني.', summaryEn: 'Explains dashboard metrics and date range.', keywords: ['لوحة', 'dashboard', 'مؤشرات'], articleType: 'OVERVIEW', difficulty: 'BASIC', featureKey: 'dashboard', routePatterns: ['/'], sortOrder: 5, contentAr: '<p>تعرض لوحة المعلومات إجماليات جهات الاتصال والمحادثات والرسائل ومعدلات التسليم والقراءة.</p><div class="note">تتحدث الأرقام بعد معالجة أحداث الويب هوك؛ قد يستغرق التحديث بضع دقائق.</div>', contentEn: '<p>The dashboard shows totals for contacts, conversations, messages, and delivery/read rates.</p><div class="note">Numbers update after webhook processing; it may take a few minutes.</div>' },
  { categorySlug: 'whatsapp-configuration', slug: 'required-meta-information', titleAr: 'معلومات Meta المطلوبة', titleEn: 'Required Meta information', summaryAr: 'القيم التي تحتاجها من Meta قبل الربط.', summaryEn: 'The values you need from Meta before connecting.', keywords: ['meta', 'app id', 'app secret'], articleType: 'REFERENCE', difficulty: 'INTERMEDIATE', featureKey: 'whatsapp', routePatterns: ['/whatsapp'], sortOrder: 2, contentAr: '<ul><li>App ID</li><li>App Secret</li><li>Verify Token</li><li>WABA ID (اختياري)</li><li>Phone Number ID (اختياري)</li></ul>', contentEn: '<ul><li>App ID</li><li>App Secret</li><li>Verify Token</li><li>WABA ID (optional)</li><li>Phone Number ID (optional)</li></ul>' },
  { categorySlug: 'whatsapp-configuration', slug: 'testing-the-connection', titleAr: 'اختبار الاتصال', titleEn: 'Testing the connection', summaryAr: 'كيف تتحقق من أن بيانات الاعتماد صحيحة.', summaryEn: 'How to verify your credentials are correct.', keywords: ['اختبار', 'test', 'اتصال', 'connection'], articleType: 'STEP_BY_STEP', difficulty: 'INTERMEDIATE', featureKey: 'whatsapp', routePatterns: ['/whatsapp'], sortOrder: 3, contentAr: '<p>من صفحة واتساب اضغط <strong>اختبار الاتصال</strong>. إذا فشل الاختبار راجع رسالة الخطأ ورمز الحالة من Meta.</p>', contentEn: '<p>From the WhatsApp page click <strong>Test connection</strong>. If it fails, review the error message and Meta status code.</p>' },
  { categorySlug: 'whatsapp-configuration', slug: 'synchronizing-phone-number', titleAr: 'مزامنة رقم الهاتف', titleEn: 'Synchronizing the phone number', summaryAr: 'ربط رقم الهاتف المرسل.', summaryEn: 'Linking the sending phone number.', keywords: ['مزامنة', 'رقم', 'phone', 'sync'], articleType: 'STEP_BY_STEP', difficulty: 'INTERMEDIATE', featureKey: 'whatsapp', routePatterns: ['/whatsapp'], sortOrder: 4, contentAr: '<ol><li>تأكد من ربط الرقم في Meta Business Manager.</li><li>في المنصة اضغط <strong>مزامنة الأرقام</strong>.</li><li>تحقق من ظهور الرقم بحالة نشط.</li></ol>', contentEn: '<ol><li>Ensure the number is linked in Meta Business Manager.</li><li>In the platform click <strong>Sync numbers</strong>.</li><li>Verify the number appears as active.</li></ol>' },
  { categorySlug: 'whatsapp-configuration', slug: 'configuring-webhooks', titleAr: 'إعداد الويب هوك', titleEn: 'Configuring webhooks', summaryAr: 'ربط الويب هوك لاستقبال الرسائل.', summaryEn: 'Linking the webhook to receive messages.', keywords: ['webhook', 'ويب هوك'], articleType: 'STEP_BY_STEP', difficulty: 'ADVANCED', featureKey: 'whatsapp', routePatterns: ['/whatsapp'], sortOrder: 5, contentAr: '<p>عيّن عنوان الويب هوك إلى <code>/api/webhooks/whatsapp</code> واستخدم نفس Verify Token المُدخل في المنصة، ثم اشترك في أحداث <code>messages</code>.</p>', contentEn: '<p>Set the webhook URL to <code>/api/webhooks/whatsapp</code>, use the same Verify Token entered in the platform, and subscribe to the <code>messages</code> field.</p>' },
  { categorySlug: 'whatsapp-configuration', slug: 'replacing-access-token', titleAr: 'استبدال رمز الوصول', titleEn: 'Replacing the access token', summaryAr: 'تحديث رمز وصول منتهٍ أو تالف.', summaryEn: 'Updating an expired or malformed access token.', keywords: ['token', 'رمز وصول', 'استبدال'], articleType: 'STEP_BY_STEP', difficulty: 'INTERMEDIATE', featureKey: 'whatsapp', routePatterns: ['/whatsapp'], sortOrder: 6, contentAr: '<ol><li>أنشئ رمز وصول جديدًا في Meta.</li><li>من صفحة واتساب استبدل الرمز القديم.</li><li>احفظ ثم اختبر الاتصال.</li></ol>', contentEn: '<ol><li>Generate a new token in Meta.</li><li>Replace the old token on the WhatsApp page.</li><li>Save, then test the connection.</li></ol>' },
  { categorySlug: 'contacts', slug: 'creating-a-contact', titleAr: 'إنشاء جهة اتصال', titleEn: 'Creating a contact', summaryAr: 'إضافة جهة اتصال يدويًا.', summaryEn: 'Adding a contact manually.', keywords: ['إنشاء', 'create', 'جهة اتصال', 'contact'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'contacts', routePatterns: ['/contacts'], sortOrder: 1, contentAr: '<ol><li>افتح <strong>جهات الاتصال</strong> ثم <strong>إضافة جهة اتصال</strong>.</li><li>أدخل الاسم ورقم الهاتف بالصيغة الدولية مع رمز الدولة.</li><li>احفظ. تظهر الحالة «نشط» افتراضيًا.</li></ol>', contentEn: '<ol><li>Open <strong>Contacts</strong>, then <strong>Add contact</strong>.</li><li>Enter the name and phone number in international format with the country code.</li><li>Save. The status defaults to “Active”.</li></ol>' },
  { categorySlug: 'contacts', slug: 'phone-number-formats', titleAr: 'صيغ أرقام الهاتف', titleEn: 'Understanding phone-number formats', summaryAr: 'الصيغة الدولية المعتمدة.', summaryEn: 'The accepted international format.', keywords: ['رقم', 'phone', 'صيغة', 'format'], articleType: 'REFERENCE', difficulty: 'BASIC', featureKey: 'contacts', routePatterns: ['/contacts'], sortOrder: 2, contentAr: '<p>استخدم الصيغة الدولية: رمز الدولة متبوعًا بالرقم بدون + أو مسافات، مثل <code dir="ltr">201012345678</code> لمصر.</p><div class="warning">الأرقام غير الصالحة تُرفض أو تُعلَّم كغير صالحة ولا يمكن استهدافها في الحملات.</div>', contentEn: '<p>Use the international format: country code followed by the number without + or spaces, e.g. <code dir="ltr">201012345678</code> for Egypt.</p><div class="warning">Invalid numbers are rejected or marked invalid and cannot be targeted in campaigns.</div>' },
  { categorySlug: 'contacts', slug: 'importing-contacts-from-excel', titleAr: 'استيراد جهات الاتصال من Excel', titleEn: 'Importing contacts from Excel', summaryAr: 'رفع ملف CSV أو Excel واستيراد الجمهور دفعة واحدة.', summaryEn: 'Upload a CSV or Excel file and import your audience in bulk.', keywords: ['استيراد', 'import', 'excel', 'csv'], articleType: 'STEP_BY_STEP', difficulty: 'INTERMEDIATE', featureKey: 'imports', routePatterns: ['/imports'], isFeatured: true, sortOrder: 1, contentAr: `
<div class="goal">الهدف: إضافة مئات أو آلاف جهات الاتصال دفعة واحدة من ملف.</div>
<h2>قبل البدء</h2>
<ul><li>ملف CSV أو Excel بامتداد .xlsx.</li><li>عمود رقم الهاتف بصيغة دولية.</li></ul>
<div class="permission">الإجراء متاح لدور ADMIN أو MANAGER.</div>
<h2>الخطوات</h2>
<ol>
<li>افتح <strong>الاستيراد</strong> وارفع الملف.</li>
<li>راجع المعاينة وطابق الأعمدة مع الحقول (الاسم، الهاتف، البريد...).</li>
<li>اختر خيارات المكررات والموافقة ثم ابدأ الاستيراد.</li>
<li>راجع ملخص التحقق وعدد الصفوف الصالحة.</li>
<li>نزّل الصفوف المرفوضة كملف CSV وصححها وأعد رفعها.</li>
</ol>
<div class="success">النتيجة: صفوف أنشئت أو حُدِّثت أو تُركت، مع تقرير بالرفض.</div>
<div class="mistake">ملف بلا عمود هاتف صالح — أضف عمود الهاتف وأعد المحاولة.</div>`,
    contentEn: `
<div class="goal">Goal: add hundreds or thousands of contacts in one go from a file.</div>
<h2>Before you start</h2>
<ul><li>A CSV or .xlsx Excel file.</li><li>A phone column in international format.</li></ul>
<div class="permission">Available to the ADMIN or MANAGER role.</div>
<h2>Steps</h2>
<ol>
<li>Open <strong>Imports</strong> and upload the file.</li>
<li>Review the preview and map columns to fields (name, phone, email...).</li>
<li>Choose duplicate and consent options, then start the import.</li>
<li>Review the validation summary and valid row count.</li>
<li>Download rejected rows as CSV, fix them, and re-upload.</li>
</ol>
<div class="success">Result: rows created, updated, or skipped, with a rejection report.</div>
<div class="mistake">File without a valid phone column — add one and retry.</div>`,
  },
  { categorySlug: 'contacts', slug: 'mapping-import-columns', titleAr: 'ربط أعمدة الاستيراد', titleEn: 'Mapping import columns', summaryAr: 'تطابق أعمدة الملف مع حقول المنصة.', summaryEn: 'Matching file columns to platform fields.', keywords: ['أعمدة', 'columns', 'map', 'ربط'], articleType: 'REFERENCE', difficulty: 'INTERMEDIATE', featureKey: 'imports', routePatterns: ['/imports'], sortOrder: 2, contentAr: '<p>اختر لكل عمود في ملفك الحقل المناسب. حقل <code>phone</code> إلزامي.</p>', contentEn: '<p>Choose the matching field for each column in your file. The <code>phone</code> field is required.</p>' },
  { categorySlug: 'contacts', slug: 'resolving-rejected-rows', titleAr: 'حل الصفوف المرفوضة', titleEn: 'Resolving rejected import rows', summaryAr: 'قراءة تقرير الرفض وإصلاح البيانات.', summaryEn: 'Reading the rejection report and fixing data.', keywords: ['رفض', 'rejected', 'أخطاء'], articleType: 'TROUBLESHOOTING', difficulty: 'INTERMEDIATE', featureKey: 'imports', routePatterns: ['/imports'], sortOrder: 3, contentAr: '<p>كل صف مرفوض يوضح السبب (رقم غير صالح، مكرر، نقص بيانات). صحّح السبب في الملف وأعد الاستيراد.</p>', contentEn: '<p>Each rejected row shows a reason (invalid number, duplicate, missing data). Fix the cause in the file and re-import.</p>' },
  { categorySlug: 'contacts', slug: 'managing-duplicates', titleAr: 'إدارة المكررات', titleEn: 'Managing duplicates', summaryAr: 'كيف تتعامل المنصة مع الأرقام المكررة.', summaryEn: 'How the platform handles duplicate numbers.', keywords: ['مكرر', 'duplicate'], articleType: 'OVERVIEW', difficulty: 'BASIC', featureKey: 'contacts', routePatterns: ['/contacts'], sortOrder: 4, contentAr: '<p>عند الاستيراد يمكنك تخطي المكررات أو تحديثها. تُحدد المكررات برقم الهاتف الموحد.</p>', contentEn: '<p>During import you can skip or update duplicates. Duplicates are identified by normalized phone number.</p>' },
  { categorySlug: 'contacts', slug: 'archiving-restoring-contacts', titleAr: 'أرشفة واستعادة جهات الاتصال', titleEn: 'Archiving and restoring contacts', summaryAr: 'إخفاء جهات الاتصال دون حذفها.', summaryEn: 'Hiding contacts without deleting them.', keywords: ['أرشفة', 'archive', 'استعادة', 'restore'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'contacts', routePatterns: ['/contacts'], sortOrder: 5, contentAr: '<ol><li>اختر جهة الاتصال ثم <strong>أرشفة</strong>.</li><li>للاستعادة افتح الأرشيف ثم <strong>استعادة</strong>.</li></ol><div class="note">لا تُحذف البيانات عند الأرشفة.</div>', contentEn: '<ol><li>Select the contact, then <strong>Archive</strong>.</li><li>To restore, open the archive and click <strong>Restore</strong>.</li></ol><div class="note">Data is not deleted when archived.</div>' },
  { categorySlug: 'contacts', slug: 'exporting-contacts', titleAr: 'تصدير جهات الاتصال', titleEn: 'Exporting contacts', summaryAr: 'تنزيل الجمهور كملف CSV.', summaryEn: 'Downloading your audience as a CSV file.', keywords: ['تصدير', 'export', 'csv'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'contacts', routePatterns: ['/contacts'], sortOrder: 6, contentAr: '<p>اضغط <strong>تصدير</strong> وانتظر اكتمال الملف ثم نزّله من قائمة التصدير.</p><div class="warning">يحتوي الملف على بيانات شخصية؛ تعامل معه وفق سياسات الخصوصية.</div>', contentEn: '<p>Click <strong>Export</strong>, wait for the file, then download it from the export list.</p><div class="warning">The file contains personal data; handle it per your privacy policies.</div>' },
  { categorySlug: 'consent-suppression', slug: 'understanding-opt-in', titleAr: 'فهم الاشتراك', titleEn: 'Understanding opt-in', summaryAr: 'ما معنى موافقة العميل على استلام الرسائل.', summaryEn: 'What customer consent to receive messages means.', keywords: ['اشتراك', 'opt-in', 'موافقة', 'consent'], articleType: 'OVERVIEW', difficulty: 'BASIC', featureKey: 'contacts', routePatterns: ['/contacts'], sortOrder: 1, contentAr: '<p>الاشتراك هو موافقة صريحة من العميل على استلام رسائل تسويقية. ركّز حملاتك على من أعطوا الموافقة.</p>', contentEn: '<p>Opt-in is the customer’s explicit agreement to receive marketing messages. Focus campaigns on those who opted in.</p>' },
  { categorySlug: 'consent-suppression', slug: 'recording-customer-consent', titleAr: 'تسجيل موافقة العميل', titleEn: 'Recording customer consent', summaryAr: 'تحديث حالة الموافقة لجهة الاتصال.', summaryEn: 'Updating a contact’s consent state.', keywords: ['موافقة', 'consent', 'تسجيل'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'contacts', routePatterns: ['/contacts'], sortOrder: 2, contentAr: '<ol><li>افتح جهة الاتصال.</li><li>غيّر حالة الموافقة إلى «اشترك» أو «غير معروف».</li><li>احفظ. تُسجَّل العملية في سجل التدقيق.</li></ol>', contentEn: '<ol><li>Open the contact.</li><li>Set consent to “Opted in” or “Unknown”.</li><li>Save. The change is recorded in the audit log.</li></ol>' },
  { categorySlug: 'consent-suppression', slug: 'understanding-unknown-consent', titleAr: 'حالة الموافقة غير المعروفة', titleEn: 'Understanding unknown consent', summaryAr: 'ماذا تعني الموافقة «غير معروفة».', summaryEn: 'What “unknown” consent means.', keywords: ['غير معروف', 'unknown', 'consent'], articleType: 'REFERENCE', difficulty: 'BASIC', featureKey: 'contacts', routePatterns: ['/contacts'], sortOrder: 3, contentAr: '<p>غير المعروف = لم تُثبت الموافقة. لا تستهدف هذه المجموعة بحملات تسويقية حتى تحصل على موافقة صريحة.</p>', contentEn: '<p>Unknown = consent not established. Do not target this group with marketing campaigns until you obtain explicit consent.</p>' },
  { categorySlug: 'consent-suppression', slug: 'processing-opt-out', titleAr: 'معالجة طلبات إلغاء الاشتراك', titleEn: 'Processing an opt-out', summaryAr: 'الرد بكلمة STOP وكيف تتعامل المنصة معها.', summaryEn: 'Replying with a stop word and how the platform handles it.', keywords: ['إلغاء', 'opt-out', 'stop', 'اشتراك'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'inbox', routePatterns: ['/inbox'], isFeatured: true, sortOrder: 4, contentAr: `
<div class="goal">الهدف: احترام رغبة العميل في التوقف عن الاستلام فورًا.</div>
<h2>الخطوات</h2>
<ol>
<li>يرد العميل بكلمة إيقاف (مثل stop).</li>
<li>تكتشف المنصة الإلغاء تلقائيًا عبر الويب هوك.</li>
<li>تُزَال جهة الاتصال من المستلمين الحاليين للحملات.</li>
<li>تُسجَّل جهة الاتصال كمستبعدة، فتتخطاها الحملات لاحقًا.</li>
</ol>
<div class="success">النتيجة: لن يستقبل العميل رسائل حملات بعد الآن.</div>
<div class="warning">لا ترسل رسائل يدوية لمن ألغى الاشتراك إلا في سياق خدمة العملاء الضرورية.</div>`,
    contentEn: `
<div class="goal">Goal: respect the customer’s request to stop receiving messages immediately.</div>
<h2>Steps</h2>
<ol>
<li>The customer replies with a stop word (e.g. stop).</li>
<li>The platform detects the opt-out automatically via the webhook.</li>
<li>The contact is removed from current campaign recipients.</li>
<li>The contact is recorded as suppressed, so future campaigns skip them.</li>
</ol>
<div class="success">Result: the customer will no longer receive campaign messages.</div>
<div class="warning">Do not manually message opted-out customers except for essential customer service.</div>`,
  },
  { categorySlug: 'consent-suppression', slug: 'suppression-list-behavior', titleAr: 'سلوك قائمة الاستبعاد', titleEn: 'Suppression-list behavior', summaryAr: 'كيف تُستبعد جهات الاتصال من الحملات.', summaryEn: 'How suppressed contacts are excluded from campaigns.', keywords: ['استبعاد', 'suppression', 'قائمة'], articleType: 'OVERVIEW', difficulty: 'BASIC', featureKey: 'campaigns', routePatterns: ['/campaigns'], sortOrder: 5, contentAr: '<p>تُستبعد جهات الاتصال المستبعدة تلقائيًا من حسابات جمهور الحملات، ويظهر السبب في صفحة جهة الاتصال.</p>', contentEn: '<p>Suppressed contacts are automatically excluded from campaign audiences, and the reason is shown on the contact page.</p>' },
  { categorySlug: 'consent-suppression', slug: 'why-contact-cannot-receive', titleAr: 'لماذا لا يمكن استهداف جهة الاتصال', titleEn: 'Why a contact cannot receive campaigns', summaryAr: 'أسباب الاستبعاد الشائعة.', summaryEn: 'Common reasons for exclusion.', keywords: ['استبعاد', 'ineligible', 'لماذا'], articleType: 'TROUBLESHOOTING', difficulty: 'BASIC', featureKey: 'contacts', routePatterns: ['/contacts'], sortOrder: 6, contentAr: '<ul><li>ألغى الاشتراك (مستبعد).</li><li>رقم غير صالح أو محظور.</li><li>ليس لديه موافقة معروفة.</li></ul>', contentEn: '<ul><li>Opted out (suppressed).</li><li>Invalid or blocked number.</li><li>No known consent.</li></ul>' },
  { categorySlug: 'consent-suppression', slug: 'restoring-suppressed-contact', titleAr: 'استعادة جهة اتصال مستبعدة بأمان', titleEn: 'Safely restoring a suppressed contact', summaryAr: 'إعادة تفعيل جهة اتصال بعد طلب واضح.', summaryEn: 'Re-enabling a contact after an explicit request.', keywords: ['استعادة', 'restore', 'مستبعد'], articleType: 'STEP_BY_STEP', difficulty: 'INTERMEDIATE', featureKey: 'contacts', routePatterns: ['/contacts'], sortOrder: 7, contentAr: '<ol><li>تأكد من طلب صريح جديد من العميل للاشتراك.</li><li>افتح جهة الاتصال وأزل الاستبعاد.</li><li>سجّل حالة موافقة جديدة.</li></ol><div class="warning">لا تستعد مستبعدًا دون دليل موافقة جديد.</div>', contentEn: '<ol><li>Confirm a fresh, explicit request to opt back in.</li><li>Open the contact and remove the suppression.</li><li>Record a new consent state.</li></ol><div class="warning">Do not restore a suppressed contact without new evidence of consent.</div>' },
  { categorySlug: 'lists-tags', slug: 'creating-contact-list', titleAr: 'إنشاء قائمة جهات اتصال', titleEn: 'Creating a contact list', summaryAr: 'تجميع جمهور قابل لإعادة الاستخدام.', summaryEn: 'Building a reusable audience.', keywords: ['قائمة', 'list', 'إنشاء'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'lists', routePatterns: ['/lists'], sortOrder: 1, contentAr: '<ol><li>افتح <strong>القوائم</strong> ثم <strong>إنشاء قائمة</strong>.</li><li>سمِّ القائمة وأضف جهات الاتصال.</li><li>استخدم القائمة كجمهور للحملات.</li></ol>', contentEn: '<ol><li>Open <strong>Lists</strong>, then <strong>Create list</strong>.</li><li>Name the list and add contacts.</li><li>Use the list as a campaign audience.</li></ol>' },
  { categorySlug: 'lists-tags', slug: 'adding-removing-list-members', titleAr: 'إضافة وإزالة أعضاء القائمة', titleEn: 'Adding and removing list members', summaryAr: 'تعديل أعضاء القائمة.', summaryEn: 'Editing list membership.', keywords: ['أعضاء', 'members', 'قائمة'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'lists', routePatterns: ['/lists'], sortOrder: 2, contentAr: '<p>افتح القائمة واستخدم «إضافة جهات اتصال» أو حدد الصفوف وأزلها.</p>', contentEn: '<p>Open the list and use “Add contacts” or select rows to remove them.</p>' },
  { categorySlug: 'lists-tags', slug: 'creating-tags', titleAr: 'إنشاء الوسوم', titleEn: 'Creating tags', summaryAr: 'إضافة تصنيفات لجهات الاتصال.', summaryEn: 'Adding labels to contacts.', keywords: ['وسم', 'tag', 'إنشاء'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'tags', routePatterns: ['/tags'], sortOrder: 3, contentAr: '<ol><li>افتح <strong>الوسوم</strong> ثم <strong>إنشاء وسم</strong>.</li><li>سمِّ الوسم واحفظه.</li><li>أضف الوسم لجهات الاتصال من صفحة جهة الاتصال أو إجراءات جماعية.</li></ol>', contentEn: '<ol><li>Open <strong>Tags</strong>, then <strong>Create tag</strong>.</li><li>Name the tag and save.</li><li>Apply the tag to contacts from the contact page or bulk actions.</li></ol>' },
  { categorySlug: 'lists-tags', slug: 'lists-versus-tags', titleAr: 'القوائم أم الوسوم؟', titleEn: 'Using lists versus tags', summaryAr: 'متى تستخدم قائمة ومتى تستخدم وسمًا.', summaryEn: 'When to use a list versus a tag.', keywords: ['قائمة', 'وسم', 'lists', 'tags'], articleType: 'REFERENCE', difficulty: 'BASIC', featureKey: 'lists', routePatterns: ['/lists'], sortOrder: 4, contentAr: '<p>القوائم جمهور للحملات. الوسوم تصنيفات للتصفية والبحث. يمكن الجمع بينهما.</p>', contentEn: '<p>Lists are campaign audiences. Tags are labels for filtering and search. You can combine both.</p>' },
  { categorySlug: 'lists-tags', slug: 'bulk-contact-actions', titleAr: 'الإجراءات الجماعية', titleEn: 'Bulk contact actions', summaryAr: 'تطبيق إجراءات على عدة جهات دفعة واحدة.', summaryEn: 'Applying actions to many contacts at once.', keywords: ['جماعي', 'bulk', 'إجراءات'], articleType: 'STEP_BY_STEP', difficulty: 'INTERMEDIATE', featureKey: 'contacts', routePatterns: ['/contacts'], sortOrder: 5, contentAr: '<p>حدد عدة جهات من قائمة جهات الاتصال واستخدم الأزرار الجماعية لإضافة وسوم أو قوائم أو أرشفة.</p>', contentEn: '<p>Select multiple contacts from the list and use bulk buttons to add tags, lists, or archive.</p>' },
  { categorySlug: 'message-templates', slug: 'understanding-templates', titleAr: 'فهم قوالب الرسائل', titleEn: 'Understanding WhatsApp templates', summaryAr: 'ما هي القوالب ولماذا هي ضرورية.', summaryEn: 'What templates are and why they matter.', keywords: ['قالب', 'template', 'فهم'], articleType: 'OVERVIEW', difficulty: 'BASIC', featureKey: 'templates', routePatterns: ['/templates'], sortOrder: 1, contentAr: '<p>القالب هو رسالة معتمدة من Meta مسبقًا تُستخدم خارج نافذة خدمة العملاء (24 ساعة). لا يمكن إرسال حملة بدون قالب معتمد.</p>', contentEn: '<p>A template is a pre-approved Meta message used outside the 24-hour customer service window. Campaigns cannot be sent without an approved template.</p>' },
  { categorySlug: 'message-templates', slug: 'synchronizing-templates', titleAr: 'مزامنة القوالب', titleEn: 'Synchronizing templates', summaryAr: 'جلب القوالب من Meta إلى المنصة.', summaryEn: 'Fetching templates from Meta into the platform.', keywords: ['مزامنة', 'sync', 'قوالب'], articleType: 'STEP_BY_STEP', difficulty: 'INTERMEDIATE', featureKey: 'templates', routePatterns: ['/templates'], isFeatured: true, sortOrder: 2, contentAr: `
<div class="goal">الهدف: مزامنة قوالب Meta المعتمدة لتتوفر في الحملات.</div>
<h2>الخطوات</h2>
<ol>
<li>افتح <strong>القوالب</strong>.</li>
<li>اضغط <strong>مزامنة القوالب</strong>.</li>
<li>تحقق من حالة كل قالب؛ المعتمد فقط يُستخدم في الحملات.</li>
</ol>
<div class="warning">المزامنة تتطلب اتصال Meta نشطًا وبيانات اعتماد صحيحة.</div>`,
    contentEn: `
<div class="goal">Goal: synchronize approved Meta templates so they are available in campaigns.</div>
<h2>Steps</h2>
<ol>
<li>Open <strong>Templates</strong>.</li>
<li>Click <strong>Sync templates</strong>.</li>
<li>Check each template’s status; only approved templates can be used in campaigns.</li>
</ol>
<div class="warning">Syncing requires an active Meta connection and valid credentials.</div>`,
  },
  { categorySlug: 'message-templates', slug: 'template-categories', titleAr: 'تصنيفات القوالب', titleEn: 'Template categories', summaryAr: 'التسويقي والعملي والمصادقة.', summaryEn: 'Marketing, utility, and authentication.', keywords: ['تصنيف', 'category', 'تسويقي'], articleType: 'REFERENCE', difficulty: 'BASIC', featureKey: 'templates', routePatterns: ['/templates'], sortOrder: 3, contentAr: '<p>التسويقي: عروض وترويج. العملي: إشعارات وطلبات. المصادقة: رموز تحقق OTP.</p>', contentEn: '<p>Marketing: offers and promos. Utility: notifications and requests. Authentication: OTP codes.</p>' },
  { categorySlug: 'message-templates', slug: 'template-statuses', titleAr: 'حالات القوالب', titleEn: 'Template statuses', summaryAr: 'معتمد، قيد المراجعة، مرفوض، وغيره.', summaryEn: 'Approved, in review, rejected, and more.', keywords: ['حالة', 'status', 'معتمد'], articleType: 'REFERENCE', difficulty: 'BASIC', featureKey: 'templates', routePatterns: ['/templates'], sortOrder: 4, contentAr: '<p>المعتمد APPROVED يُرسل. قيد المراجعة PENDING. المرفوض REJECTED يتطلب تعديلًا. المعطل DISABLED لا يُرسل.</p>', contentEn: '<p>APPROVED templates send. PENDING are in review. REJECTED need edits. DISABLED cannot send.</p>' },
  { categorySlug: 'message-templates', slug: 'creating-a-template', titleAr: 'إنشاء قالب', titleEn: 'Creating a template', summaryAr: 'إرسال قالب جديد إلى Meta للمراجعة.', summaryEn: 'Submitting a new template to Meta for review.', keywords: ['إنشاء', 'create', 'قالب'], articleType: 'STEP_BY_STEP', difficulty: 'INTERMEDIATE', featureKey: 'templates', routePatterns: ['/templates'], sortOrder: 5, contentAr: '<ol><li>افتح <strong>القوالب</strong> ثم <strong>إنشاء قالب</strong>.</li><li>أدخل الاسم (أحرف صغيرة وأرقام وشرطات سفلية) واللغة والتصنيف.</li><li>أضف النص والمتغيرات والأزرار.</li><li>أرسل للمراجعة وانتظر قرار Meta.</li></ol>', contentEn: '<ol><li>Open <strong>Templates</strong>, then <strong>Create template</strong>.</li><li>Enter a name (lowercase, digits, underscores), language, and category.</li><li>Add the body, variables, and buttons.</li><li>Submit for review and wait for Meta’s decision.</li></ol>' },
  { categorySlug: 'message-templates', slug: 'adding-template-variables', titleAr: 'إضافة المتغيرات', titleEn: 'Adding variables', summaryAr: 'تخصيص الرسالة لكل مستلم.', summaryEn: 'Personalizing the message per recipient.', keywords: ['متغير', 'variable', 'تخصيص'], articleType: 'REFERENCE', difficulty: 'BASIC', featureKey: 'templates', routePatterns: ['/templates'], sortOrder: 6, contentAr: '<p>استخدم {{1}}، {{2}}... داخل النص وطابِقها عند إنشاء الحملة (مثل الاسم أو رقم الطلب).</p>', contentEn: '<p>Use {{1}}, {{2}}... inside the text and map them when building the campaign (e.g., name or order number).</p>' },
  { categorySlug: 'message-templates', slug: 'adding-template-buttons', titleAr: 'إضافة الأزرار', titleEn: 'Adding buttons', summaryAr: 'ردود سريعة وروابط وأرقام هاتف.', summaryEn: 'Quick replies, URLs, and phone numbers.', keywords: ['زر', 'button', 'رابط'], articleType: 'REFERENCE', difficulty: 'INTERMEDIATE', featureKey: 'templates', routePatterns: ['/templates'], sortOrder: 7, contentAr: '<p>يمكن إضافة أزرار رد سريع أو رابط أو رقم هاتف. لكل زر نص محدد حسب نوعه.</p>', contentEn: '<p>You can add quick-reply, URL, or phone-number buttons. Each button has constraints based on its type.</p>' },
  { categorySlug: 'message-templates', slug: 'understanding-template-rejection', titleAr: 'فهم رفض القالب', titleEn: 'Understanding template rejection', summaryAr: 'أسباب الرفض وكيفية الإصلاح.', summaryEn: 'Why templates get rejected and how to fix them.', keywords: ['رفض', 'rejected', 'قالب'], articleType: 'TROUBLESHOOTING', difficulty: 'INTERMEDIATE', featureKey: 'templates', routePatterns: ['/templates'], sortOrder: 8, contentAr: '<p>سبب الرفض يظهر في القالب. الأسباب الشائعة: ادعاءات غير مدعومة، رموز قصيرة ممنوعة، نص غير واضح. عدّل وأعد الإرسال.</p>', contentEn: '<p>The rejection reason is shown on the template. Common causes: unsupported claims, disallowed shortcodes, unclear text. Edit and resubmit.</p>' },
  { categorySlug: 'message-templates', slug: 'why-template-unusable', titleAr: 'لماذا لا يمكن استخدام القالب', titleEn: 'Why a template cannot be used', summaryAr: 'الأسباب التي تمنع اختيار القالب.', summaryEn: 'Reasons a template cannot be selected.', keywords: ['لا يمكن', 'unusable', 'قالب'], articleType: 'TROUBLESHOOTING', difficulty: 'BASIC', featureKey: 'templates', routePatterns: ['/templates'], sortOrder: 9, contentAr: '<p>القوالب غير المعتمدة أو المعطلة لا تظهر في قوائم الحملات. أعد المزامنة وتحقق من الحالة.</p>', contentEn: '<p>Unapproved or disabled templates do not appear in campaign pickers. Re-sync and check the status.</p>' },
  { categorySlug: 'campaigns', slug: 'creating-the-first-campaign', titleAr: 'إنشاء الحملة الأولى', titleEn: 'Creating the first campaign', summaryAr: 'خطوات كاملة من القالب إلى الإطلاق.', summaryEn: 'Complete steps from template to launch.', keywords: ['حملة', 'campaign', 'إنشاء', 'أول'], articleType: 'STEP_BY_STEP', difficulty: 'INTERMEDIATE', featureKey: 'campaigns', routePatterns: ['/campaigns'], isFeatured: true, sortOrder: 1, contentAr: `
<div class="goal">الهدف: إرسال أول حملة إلى جمهور محدد بنجاح.</div>
<h2>قبل البدء</h2>
<ul><li>قالب معتمد.</li><li>قائمة جمهور أو شرط تصفية.</li><li>مستلمون لديهم موافقة.</li></ul>
<div class="permission">الإجراء متاح لدور ADMIN أو MANAGER.</div>
<h2>الخطوات</h2>
<ol>
<li>افتح <strong>الحملات</strong> ثم <strong>حملة جديدة</strong>.</li>
<li>أدخل الاسم واختر القالب.</li>
<li>طابِق متغيرات القالب مع حقول جهات الاتصال.</li>
<li>اختر الجمهور (قائمة أو تصفية).</li>
<li>راجع الفحص المسبق وتأكد من خلوه من الأخطاء.</li>
<li>أرسل رسالة اختبار أو حدد الموعد ثم أطلق.</li>
</ol>
<div class="success">النتيجة: حالة الحملة «قيد التنفيذ» ثم «مكتملة» مع تقرير بالمستلمين.</div>
<div class="mistake">لا يوجد جمهور — أضف مستلمين مؤهلين قبل الإطلاق.</div>`,
    contentEn: `
<div class="goal">Goal: send your first campaign to a targeted audience successfully.</div>
<h2>Before you start</h2>
<ul><li>An approved template.</li><li>An audience list or filter.</li><li>Recipients with consent.</li></ul>
<div class="permission">Available to the ADMIN or MANAGER role.</div>
<h2>Steps</h2>
<ol>
<li>Open <strong>Campaigns</strong>, then <strong>New campaign</strong>.</li>
<li>Enter a name and choose the template.</li>
<li>Map template variables to contact fields.</li>
<li>Choose the audience (list or filter).</li>
<li>Review preflight validation and make sure it is clean.</li>
<li>Send a test message or schedule, then launch.</li>
</ol>
<div class="success">Result: campaign status “Running” then “Completed” with a recipient report.</div>
<div class="mistake">No audience — add eligible recipients before launching.</div>`,
  },
  { categorySlug: 'campaigns', slug: 'selecting-an-audience', titleAr: 'اختيار الجمهور', titleEn: 'Selecting an audience', summaryAr: 'قائمة أو تصفية مؤهلة.', summaryEn: 'A list or an eligible filter.', keywords: ['جمهور', 'audience', 'اختيار'], articleType: 'REFERENCE', difficulty: 'BASIC', featureKey: 'campaigns', routePatterns: ['/campaigns'], sortOrder: 2, contentAr: '<p>اختر قائمة محفوظة أو استخدم تصفية مباشرة. تُستبعد جهات الاتصال المستبعدة وغير الصالحة تلقائيًا.</p>', contentEn: '<p>Choose a saved list or use a direct filter. Suppressed and invalid contacts are excluded automatically.</p>' },
  { categorySlug: 'campaigns', slug: 'mapping-template-variables', titleAr: 'ربط متغيرات القالب', titleEn: 'Mapping template variables', summaryAr: 'تخصيص المتغيرات من بيانات جهات الاتصال.', summaryEn: 'Filling variables from contact data.', keywords: ['متغير', 'variable', 'ربط'], articleType: 'REFERENCE', difficulty: 'INTERMEDIATE', featureKey: 'campaigns', routePatterns: ['/campaigns'], sortOrder: 3, contentAr: '<p>اربط كل {{n}} بحقل من جهات الاتصال (الاسم، المدينة...). المستلمون الناقصون تُسقط بياناتهم أو يُستبعدون حسب الإعدادات.</p>', contentEn: '<p>Map each {{n}} to a contact field (name, city...). Recipients with missing data are skipped or excluded per your settings.</p>' },
  { categorySlug: 'campaigns', slug: 'understanding-preflight-validation', titleAr: 'فهم الفحص المسبق', titleEn: 'Understanding preflight validation', summaryAr: 'الفحص قبل الإطلاق واكتشاف الأخطاء.', summaryEn: 'Validation before launch to catch errors.', keywords: ['فحص', 'preflight', 'تحقق'], articleType: 'OVERVIEW', difficulty: 'BASIC', featureKey: 'campaigns', routePatterns: ['/campaigns'], isFeatured: true, sortOrder: 4, contentAr: `
<div class="goal">الهدف: اكتشاف المشاكل قبل إرسال الرسائل.</div>
<p>قبل الإطلاق، يتحقق النظام من:</p>
<ul>
<li>وجود قالب معتمد.</li>
<li>وجود جمهور مؤهل.</li>
<li>اكتمال متغيرات القالب.</li>
<li>صحة أرقام الهواتف وحالة الموافقة.</li>
</ul>
<div class="note">لا يمكن الإطلاق مع وجود أخطاء مانعة في الفحص المسبق.</div>`,
    contentEn: `
<div class="goal">Goal: catch problems before sending messages.</div>
<p>Before launch, the system verifies:</p>
<ul>
<li>An approved template exists.</li>
<li>An eligible audience exists.</li>
<li>Template variables are complete.</li>
<li>Phone numbers and consent states are valid.</li>
</ul>
<div class="note">Launch is blocked while blocking errors exist in preflight.</div>`,
  },
  { categorySlug: 'campaigns', slug: 'sending-a-test-message', titleAr: 'إرسال رسالة اختبار', titleEn: 'Sending a test message', summaryAr: 'تجربة القالب والمتغيرات قبل الإطلاق.', summaryEn: 'Trying the template and variables before launch.', keywords: ['اختبار', 'test', 'رسالة'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'campaigns', routePatterns: ['/campaigns'], isFeatured: true, sortOrder: 5, contentAr: `
<div class="goal">الهدف: التحقق من شكل الرسالة والمتغيرات قبل الإرسال الجماعي.</div>
<h2>الخطوات</h2>
<ol>
<li>في منشئ الحملة اضغط <strong>إرسال رسالة اختبار</strong>.</li>
<li>أدخل رقم هاتف اختباريًا.</li>
<li>أدخل قيمًا نموذجية للمتغيرات.</li>
<li>أرسل وتأكد من وصول الرسالة وصحتها.</li>
</ol>
<div class="tip">استخدم رقمك الشخصي للتحقق من التجربة الكاملة.</div>`,
    contentEn: `
<div class="goal">Goal: verify the message look and variables before mass sending.</div>
<h2>Steps</h2>
<ol>
<li>In the campaign builder click <strong>Send test message</strong>.</li>
<li>Enter a test phone number.</li>
<li>Enter sample values for the variables.</li>
<li>Send and confirm the message arrives correctly.</li>
</ol>
<div class="tip">Use your own number to verify the full experience.</div>`,
  },
  { categorySlug: 'campaigns', slug: 'scheduling-launching', titleAr: 'جدولة الحملة وإطلاقها', titleEn: 'Scheduling and launching a campaign', summaryAr: 'إرسال فوري أو جدولة لوقت لاحق.', summaryEn: 'Send now or schedule for later.', keywords: ['جدولة', 'schedule', 'إطلاق', 'launch'], articleType: 'STEP_BY_STEP', difficulty: 'INTERMEDIATE', featureKey: 'campaigns', routePatterns: ['/campaigns'], isFeatured: true, sortOrder: 6, contentAr: `
<div class="goal">الهدف: إطلاق الحملة بالطريقة الصحيحة.</div>
<h2>الخطوات</h2>
<ol>
<li>أكمل الفحص المسبق دون أخطاء.</li>
<li>اختر <strong>إرسال الآن</strong> أو حدد وقتًا محددًا للجدولة.</li>
<li>راجع الملخص ثم <strong>إطلاق</strong>.</li>
<li>تابع الحالة في صفحة الحملة.</li>
</ol>
<div class="warning">لا يمكن بدء حملة بمستقبل «قيد الترتيب» بعد مرور موعدها؛ تحقق من الوقت والمنطقة الزمنية.</div>`,
    contentEn: `
<div class="goal">Goal: launch the campaign correctly.</div>
<h2>Steps</h2>
<ol>
<li>Complete preflight with no errors.</li>
<li>Choose <strong>Send now</strong> or set a specific time for scheduling.</li>
<li>Review the summary, then <strong>Launch</strong>.</li>
<li>Monitor the status on the campaign page.</li>
</ol>
<div class="warning">A campaign cannot start once a scheduled time has passed; check the time and timezone.</div>`,
  },
  { categorySlug: 'campaigns', slug: 'pausing-resuming-campaign', titleAr: 'إيقاف الحملة مؤقتًا واستئنافها', titleEn: 'Pausing and resuming a campaign', summaryAr: 'التحكم في الإرسال أثناء التنفيذ.', summaryEn: 'Controlling sending during execution.', keywords: ['إيقاف', 'pause', 'استئناف', 'resume'], articleType: 'STEP_BY_STEP', difficulty: 'INTERMEDIATE', featureKey: 'campaigns', routePatterns: ['/campaigns'], sortOrder: 7, contentAr: '<p>يمكن إيقاف الحملة مؤقتًا من صفحتها؛ تُعلَّق الرسائل غير المرسلة وتُستأنف لاحقًا عند استئناف الحملة.</p>', contentEn: '<p>You can pause a campaign from its page; unsent messages are suspended and resume when you resume the campaign.</p>' },
  { categorySlug: 'campaigns', slug: 'cancelling-unsent-messages', titleAr: 'إلغاء الرسائل غير المرسلة', titleEn: 'Cancelling unsent messages', summaryAr: 'إيقاف الإرسال نهائيًا.', summaryEn: 'Stopping sending permanently.', keywords: ['إلغاء', 'cancel', 'رسائل'], articleType: 'STEP_BY_STEP', difficulty: 'INTERMEDIATE', featureKey: 'campaigns', routePatterns: ['/campaigns'], sortOrder: 8, contentAr: '<p>الإلغاء يوقف إرسال الرسائل المتبقية نهائيًا. لا يمكن استئناف حملة ملغاة؛ أنشئ حملة جديدة عند الحاجة.</p>', contentEn: '<p>Cancelling permanently stops remaining sends. A cancelled campaign cannot be resumed; create a new one if needed.</p>' },
  { categorySlug: 'campaigns', slug: 'understanding-campaign-statuses', titleAr: 'حالات الحملة', titleEn: 'Understanding campaign statuses', summaryAr: 'من مسودة إلى مكتملة.', summaryEn: 'From draft to completed.', keywords: ['حالة', 'status', 'حملة'], articleType: 'REFERENCE', difficulty: 'BASIC', featureKey: 'campaigns', routePatterns: ['/campaigns'], sortOrder: 9, contentAr: '<p>مسودة → جاهزة → مجدولة → قيد الترتيب → قيد التنفيذ → مكتملة/ملغاة. الحالات المتوقفة (مؤقتة) تعني أن النظام ينتظر استئنافًا.</p>', contentEn: '<p>Draft → Ready → Scheduled → Queuing → Running → Completed/Cancelled. Paused states mean the system is waiting to resume.</p>' },
  { categorySlug: 'campaign-results', slug: 'understanding-sent-status', titleAr: 'حالة «مرسلة»', titleEn: 'Understanding sent status', summaryAr: 'قُبلت الرسالة من Meta.', summaryEn: 'The message was accepted by Meta.', keywords: ['مرسلة', 'sent'], articleType: 'REFERENCE', difficulty: 'BASIC', featureKey: 'campaigns', routePatterns: ['/campaigns'], sortOrder: 1, contentAr: '<p>«مرسلة» تعني أن Meta قبلت الرسالة للتسليم. وصولها الفعلي يظهر بحالة «تم التسليم».</p>', contentEn: '<p>“Sent” means Meta accepted the message for delivery. Actual arrival is reflected by “Delivered”.</p>' },
  { categorySlug: 'campaign-results', slug: 'understanding-delivered-status', titleAr: 'حالة «تم التسليم»', titleEn: 'Understanding delivered status', summaryAr: 'وصلت الرسالة للجهاز.', summaryEn: 'The message reached the device.', keywords: ['تسليم', 'delivered'], articleType: 'REFERENCE', difficulty: 'BASIC', featureKey: 'campaigns', routePatterns: ['/campaigns'], sortOrder: 2, contentAr: '<p>«تم التسليم» تعني أن واتساب سلّم الرسالة لجهاز المستلم، وليس بالضرورة أنها قُرئت.</p>', contentEn: '<p>“Delivered” means WhatsApp delivered the message to the recipient’s device, not necessarily that it was read.</p>' },
  { categorySlug: 'campaign-results', slug: 'understanding-read-status', titleAr: 'حالة «تمت القراءة»', titleEn: 'Understanding read status', summaryAr: 'فتح المستلم الرسالة.', summaryEn: 'The recipient opened the message.', keywords: ['قراءة', 'read'], articleType: 'REFERENCE', difficulty: 'BASIC', featureKey: 'campaigns', routePatterns: ['/campaigns'], sortOrder: 3, contentAr: '<p>«تمت القراءة» تعني أن المستلم فتح الرسالة. قد لا تتوفر هذه الحالة إذا عطّل المستلم إيصالات القراءة.</p>', contentEn: '<p>“Read” means the recipient opened the message. This may be unavailable if the recipient disabled read receipts.</p>' },
  { categorySlug: 'campaign-results', slug: 'understanding-failed-status', titleAr: 'حالة «فشل»', titleEn: 'Understanding failed status', summaryAr: 'لم تُسلَّم الرسالة والسبب.', summaryEn: 'The message was not delivered and why.', keywords: ['فشل', 'failed'], articleType: 'REFERENCE', difficulty: 'BASIC', featureKey: 'campaigns', routePatterns: ['/campaigns'], sortOrder: 4, contentAr: '<p>تعرض الحالة الفاشلة رمز السبب ورسالة Meta. الأسباب الشائعة: رقم غير صالح، المستخدم حظرك، أو رسائل محظورة.</p>', contentEn: '<p>Failed status shows a reason code and Meta message. Common causes: invalid number, user blocked you, or disallowed messaging.</p>' },
  { categorySlug: 'campaign-results', slug: 'understanding-reply-attribution', titleAr: 'إسناد الردود', titleEn: 'Understanding reply attribution', summaryAr: 'كيف تُربط الردود بالحملات.', summaryEn: 'How replies are linked to campaigns.', keywords: ['رد', 'reply', 'إسناد'], articleType: 'REFERENCE', difficulty: 'INTERMEDIATE', featureKey: 'campaigns', routePatterns: ['/campaigns'], sortOrder: 5, contentAr: '<p>تُنسب الردود الواردة إلى الحملة عبر مرجع الرسالة لتُحسب في معدل الردود.</p>', contentEn: '<p>Incoming replies are attributed to the campaign via the message reference and counted toward the reply rate.</p>' },
  { categorySlug: 'campaign-results', slug: 'reading-campaign-percentages', titleAr: 'قراءة نسب الحملة', titleEn: 'Reading campaign percentages', summaryAr: 'معدلات التسليم والقراءة والردود.', summaryEn: 'Delivery, read, and reply rates.', keywords: ['نسبة', 'percent', 'معدل'], articleType: 'REFERENCE', difficulty: 'BASIC', featureKey: 'campaigns', routePatterns: ['/campaigns'], isFeatured: true, sortOrder: 6, contentAr: '<p>معدل التسليم = المسلَّم ÷ المرسل. معدل القراءة = المقروء ÷ المسلَّم. معدل الردود = الردود ÷ المسلَّم.</p>', contentEn: '<p>Delivery rate = delivered ÷ sent. Read rate = read ÷ delivered. Reply rate = replies ÷ delivered.</p>' },
  { categorySlug: 'campaign-results', slug: 'investigating-failed-recipients', titleAr: 'التحقيق في المستلمين الفاشلين', titleEn: 'Investigating failed recipients', summaryAr: 'تحليل سبب الفشل لكل مستلم.', summaryEn: 'Analyzing the failure reason per recipient.', keywords: ['فشل', 'failed', 'مستلم'], articleType: 'STEP_BY_STEP', difficulty: 'INTERMEDIATE', featureKey: 'campaigns', routePatterns: ['/campaigns'], isFeatured: true, sortOrder: 7, contentAr: `
<div class="goal">الهدف: فهم سبب فشل كل رسالة ومعالجته.</div>
<h2>الخطوات</h2>
<ol>
<li>افتح الحملة ثم تبويب المستلمين.</li>
<li>صفِّ حسب الحالة «فشل».</li>
<li>راجع رمز السبب ورسالة Meta لكل مستلم.</li>
<li>صحّح بيانات المستلم أو أزله أو تعامل مع الحظر.</li>
</ol>
<div class="tip">أعد المحاولة عبر «إعادة» للأخطاء المؤقتة فقط.</div>`,
    contentEn: `
<div class="goal">Goal: understand why each message failed and act.</div>
<h2>Steps</h2>
<ol>
<li>Open the campaign and the recipients tab.</li>
<li>Filter by status “Failed”.</li>
<li>Review the reason code and Meta message for each recipient.</li>
<li>Fix the contact data, remove them, or address the block.</li>
</ol>
<div class="tip">Use “Retry” only for transient errors.</div>`,
  },
  { categorySlug: 'inbox', slug: 'understanding-shared-inbox', titleAr: 'فهم البريد الوارد المشترك', titleEn: 'Understanding the shared inbox', summaryAr: 'مركز موحد لمحادثات العملاء.', summaryEn: 'A unified center for customer conversations.', keywords: ['بريد', 'inbox', 'مشترك'], articleType: 'OVERVIEW', difficulty: 'BASIC', featureKey: 'inbox', routePatterns: ['/inbox'], isFeatured: true, sortOrder: 1, contentAr: '<p>يعرض البريد الوارد كل محادثات العملاء من رقم واتساب المتصل، مع تحديث لحظي وإسناد للوكلاء.</p>', contentEn: '<p>The inbox shows all customer conversations from the connected WhatsApp number, with live updates and agent assignment.</p>' },
  { categorySlug: 'inbox', slug: 'claiming-assigning-conversations', titleAr: 'حجز وإسناد المحادثات', titleEn: 'Claiming and assigning conversations', summaryAr: 'إسناد المحادثة لوكيل.', summaryEn: 'Assigning a conversation to an agent.', keywords: ['إسناد', 'assign', 'حجز', 'claim'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'inbox', routePatterns: ['/inbox'], sortOrder: 2, contentAr: '<ol><li>افتح المحادثة.</li><li>اختر «حجز» لتأخذها بنفسك.</li><li>أو اسندها لوكيل آخر من قائمة الإسناد.</li></ol>', contentEn: '<ol><li>Open the conversation.</li><li>Click “Claim” to take it yourself.</li><li>Or assign it to another agent from the assignment menu.</li></ol>' },
  { categorySlug: 'inbox', slug: 'replying-to-customer', titleAr: 'الرد على العميل', titleEn: 'Replying to a customer', summaryAr: 'الرد الحر أو بقوالب معتمدة.', summaryEn: 'Free-form or approved-template replies.', keywords: ['رد', 'reply', 'عميل'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'inbox', routePatterns: ['/inbox'], sortOrder: 3, contentAr: '<p>داخل نافذة 24 ساعة يمكن الرد برسالة حرة. خارجها يجب استخدام قالب معتمد.</p>', contentEn: '<p>Within the 24-hour window you can reply freely. Outside it, you must use an approved template.</p>' },
  { categorySlug: 'inbox', slug: 'understanding-service-window', titleAr: 'نافذة خدمة العملاء (24 ساعة)', titleEn: 'Understanding the 24-hour service window', summaryAr: 'متى يمكن الرد الحر.', summaryEn: 'When free-form replies are allowed.', keywords: ['نافذة', 'service window', '24 ساعة'], articleType: 'OVERVIEW', difficulty: 'BASIC', featureKey: 'inbox', routePatterns: ['/inbox'], isFeatured: true, sortOrder: 4, contentAr: `
<div class="goal">الهدف: فهم متى يمكن استخدام الرد الحر.</div>
<p>تفتح نافذة خدمة العملاء (24 ساعة) بعد آخر رسالة من العميل. داخلها يمكن الرد برسالة حرة أو قالب. بعد انقضائها، تُقبل القوالب المعتمدة فقط.</p>
<div class="warning">الرد الحر خارج النافذة سيفشل — استخدم قالبًا معتمدًا.</div>`,
    contentEn: `
<div class="goal">Goal: understand when free-form replies are allowed.</div>
<p>The 24-hour customer service window opens after the customer’s last message. Inside it you can reply freely or with a template. After it closes, only approved templates are accepted.</p>
<div class="warning">A free-form reply outside the window will fail — use an approved template.</div>`,
  },
  { categorySlug: 'inbox', slug: 'using-approved-templates', titleAr: 'استخدام القوالب المعتمدة في الرد', titleEn: 'Using approved templates in replies', summaryAr: 'الرد بقوالب معتمدة خارج النافذة.', summaryEn: 'Replying with approved templates outside the window.', keywords: ['قالب', 'template', 'رد'], articleType: 'STEP_BY_STEP', difficulty: 'INTERMEDIATE', featureKey: 'inbox', routePatterns: ['/inbox'], sortOrder: 5, contentAr: '<p>اختر «قالب» من محرر الرد، اختر قالبًا معتمدًا، واملأ المتغيرات ثم أرسل.</p>', contentEn: '<p>Choose “Template” in the composer, pick an approved template, fill the variables, and send.</p>' },
  { categorySlug: 'inbox', slug: 'adding-internal-notes', titleAr: 'إضافة ملاحظات داخلية', titleEn: 'Adding internal notes', summaryAr: 'ملاحظات لا يراها العميل.', summaryEn: 'Notes the customer never sees.', keywords: ['ملاحظة', 'note', 'داخلي'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'inbox', routePatterns: ['/inbox'], sortOrder: 6, contentAr: '<p>استخدم مربع «ملاحظة» لإضافة سياق لفريقك؛ لا تُرسل الملاحظات للعميل أبدًا.</p>', contentEn: '<p>Use the “Note” box to add context for your team; notes are never sent to the customer.</p>' },
  { categorySlug: 'inbox', slug: 'using-quick-replies', titleAr: 'استخدام الردود السريعة', titleEn: 'Using quick replies', summaryAr: 'إدراج نصوص جاهزة.', summaryEn: 'Inserting ready-made text.', keywords: ['رد سريع', 'quick reply'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'inbox', routePatterns: ['/inbox'], sortOrder: 7, contentAr: '<p>افتح المحادثة ثم اختر «رد سريع» لإدراج نص معرّف مسبقًا. أدر ردودك من صفحة الملف الشخصي.</p>', contentEn: '<p>Open the conversation and pick a “Quick reply” to insert predefined text. Manage your replies from your profile page.</p>' },
  { categorySlug: 'inbox', slug: 'sending-files', titleAr: 'إرسال الملفات', titleEn: 'Sending files', summaryAr: 'إرفاق ملفات في المحادثة.', summaryEn: 'Attaching files to a conversation.', keywords: ['ملف', 'file', 'مرفق'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'inbox', routePatterns: ['/inbox'], sortOrder: 8, contentAr: '<p>اضغط زر المرفق، اختر ملفًا، وانتظر رفعه ثم أرسله.</p><div class="note">بعض أنواع الملفات محدودة الحجم والنوع.</div>', contentEn: '<p>Click the attach button, choose a file, wait for upload, then send.</p><div class="note">Some file types and sizes are limited.</div>' },
  { categorySlug: 'inbox', slug: 'closing-reopening-conversations', titleAr: 'إغلاق وإعادة فتح المحادثات', titleEn: 'Closing and reopening conversations', summaryAr: 'إدارة حالة المحادثة.', summaryEn: 'Managing the conversation state.', keywords: ['إغلاق', 'close', 'إعادة فتح'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'inbox', routePatterns: ['/inbox'], sortOrder: 9, contentAr: '<p>أغلق المحادثة بعد الانتهاء منها لإزالتها من القائمة النشطة. تُعاد فتحها تلقائيًا عند رسالة جديدة أو يدويًا.</p>', contentEn: '<p>Close a conversation when done to remove it from the active list. It reopens automatically on a new message or manually.</p>' },
  { categorySlug: 'reports', slug: 'using-the-dashboard', titleAr: 'استخدام لوحة المعلومات', titleEn: 'Using the dashboard', summaryAr: 'قراءة المؤشرات الرئيسية.', summaryEn: 'Reading the main KPIs.', keywords: ['لوحة', 'dashboard', 'مؤشرات'], articleType: 'OVERVIEW', difficulty: 'BASIC', featureKey: 'reports', routePatterns: ['/reports'], sortOrder: 1, contentAr: '<p>اختر المدى الزمني والدقة لعرض المؤشرات والاتجاهات. تتحدث البيانات بعد معالجة الأحداث.</p>', contentEn: '<p>Choose the range and granularity to view KPIs and trends. Data updates after event processing.</p>' },
  { categorySlug: 'reports', slug: 'filtering-reports-by-date', titleAr: 'تصفية التقارير حسب التاريخ', titleEn: 'Filtering reports by date', summaryAr: 'تحديد نطاق زمني.', summaryEn: 'Setting a time range.', keywords: ['تاريخ', 'date', 'تصفية'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'reports', routePatterns: ['/reports'], sortOrder: 2, contentAr: '<p>استخدم محدد المدى الزمني أو التاريخين المخصصين لتصفية كل التقارير على الصفحة.</p>', contentEn: '<p>Use the range preset or the two custom dates to filter all reports on the page.</p>' },
  { categorySlug: 'reports', slug: 'campaign-performance-report', titleAr: 'تقرير أداء الحملات', titleEn: 'Campaign-performance report', summaryAr: 'أداء كل حملة.', summaryEn: 'Performance of each campaign.', keywords: ['أداء', 'performance', 'حملة'], articleType: 'REFERENCE', difficulty: 'BASIC', featureKey: 'reports', routePatterns: ['/reports'], sortOrder: 3, contentAr: '<p>يعرض عدد المستلمين والمرسل والمسلَّم والمقروء والفاشل لكل حملة، مع إمكانية التصدير.</p>', contentEn: '<p>Shows recipients, sent, delivered, read, and failed counts per campaign, with export support.</p>' },
  { categorySlug: 'reports', slug: 'exporting-reports', titleAr: 'تصدير التقارير', titleEn: 'Exporting reports', summaryAr: 'تنزيل التقارير كملفات.', summaryEn: 'Downloading reports as files.', keywords: ['تصدير', 'export'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'reports', routePatterns: ['/reports'], sortOrder: 4, contentAr: '<p>اضغط «تصدير»، انتظر اكتمال الملف في الخلفية، ثم نزّله من قائمة التصدير.</p>', contentEn: '<p>Click “Export”, wait for the background job, then download from the export list.</p>' },
  { categorySlug: 'users-permissions', slug: 'creating-a-user', titleAr: 'إنشاء مستخدم', titleEn: 'Creating a user', summaryAr: 'إضافة حساب لفريقك.', summaryEn: 'Adding an account for your team.', keywords: ['مستخدم', 'user', 'إنشاء'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'users', routePatterns: ['/users'], sortOrder: 1, contentAr: '<ol><li>افتح <strong>المستخدمون</strong> ثم <strong>إضافة مستخدم</strong>.</li><li>أدخل الاسم والبريد والدور.</li><li>اضبط كلمة مرور مؤقتة وأخطر المستخدم بها.</li></ol>', contentEn: '<ol><li>Open <strong>Users</strong>, then <strong>Add user</strong>.</li><li>Enter the name, email, and role.</li><li>Set a temporary password and share it securely.</li></ol>' },
  { categorySlug: 'users-permissions', slug: 'managing-users-and-permissions', titleAr: 'إدارة المستخدمين والصلاحيات', titleEn: 'Managing users and permissions', summaryAr: 'الأدوار الثلاثة وماذا يعني كل منها.', summaryEn: 'The three roles and what each can do.', keywords: ['مستخدم', 'users', 'صلاحيات', 'permissions'], articleType: 'REFERENCE', difficulty: 'BASIC', featureKey: 'users', routePatterns: ['/users'], isFeatured: true, sortOrder: 2, contentAr: `
<div class="goal">الهدف: فهم الأدوار وتعيين الصلاحيات الصحيحة.</div>
<h2>الأدوار</h2>
<table><thead><tr><th>الدور</th><th>أمثلة القدرات</th></tr></thead><tbody>
<tr><td>ADMIN</td><td>كل شيء: الإعدادات، المستخدمون، السجلات، العمليات.</td></tr>
<tr><td>MANAGER</td><td>جهات الاتصال، الحملات، التقارير، إدارة الوكلاء.</td></tr>
<tr><td>AGENT</td><td>البريد الوارد، الملف الشخصي، الردود السريعة.</td></tr>
</tbody></table>
<div class="permission">إنشاء المسؤولين وإيقافهم متاح للمسؤولين فقط.</div>
<div class="mistake">لا تمنح دور ADMIN لحسابات لا تحتاجه.</div>`,
    contentEn: `
<div class="goal">Goal: understand roles and assign the right permissions.</div>
<h2>Roles</h2>
<table><thead><tr><th>Role</th><th>Example capabilities</th></tr></thead><tbody>
<tr><td>ADMIN</td><td>Everything: settings, users, logs, operations.</td></tr>
<tr><td>MANAGER</td><td>Contacts, campaigns, reports, agent management.</td></tr>
<tr><td>AGENT</td><td>Inbox, profile, quick replies.</td></tr>
</tbody></table>
<div class="permission">Creating and suspending admins is available to admins only.</div>
<div class="mistake">Do not grant ADMIN to accounts that do not need it.</div>`,
  },
  { categorySlug: 'users-permissions', slug: 'suspending-a-user', titleAr: 'إيقاف مستخدم', titleEn: 'Suspending a user', summaryAr: 'منع مؤقت للوصول.', summaryEn: 'Temporary access block.', keywords: ['إيقاف', 'suspend', 'مستخدم'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'users', routePatterns: ['/users'], sortOrder: 3, contentAr: '<ol><li>افتح المستخدم ثم <strong>إيقاف</strong>.</li><li>يُبطَل الوصول فورًا وتُسحب الجلسات.</li><li>لإعادة التفعيل استخدم <strong>تفعيل</strong>.</li></ol>', contentEn: '<ol><li>Open the user, then <strong>Suspend</strong>.</li><li>Access is revoked immediately and sessions are closed.</li><li>Use <strong>Activate</strong> to re-enable.</li></ol>' },
  { categorySlug: 'users-permissions', slug: 'resetting-a-password', titleAr: 'إعادة تعيين كلمة المرور', titleEn: 'Resetting a password', summaryAr: 'إنشاء كلمة مرور جديدة لمستخدم.', summaryEn: 'Setting a new password for a user.', keywords: ['كلمة مرور', 'password', 'إعادة تعيين'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'users', routePatterns: ['/users'], sortOrder: 4, contentAr: '<ol><li>افتح المستخدم ثم <strong>إعادة تعيين كلمة المرور</strong>.</li><li>أدخل كلمة قوية وأبلغ المستخدم بها عبر قناة آمنة.</li></ol>', contentEn: '<ol><li>Open the user, then <strong>Reset password</strong>.</li><li>Enter a strong password and share it through a secure channel.</li></ol>' },
  { categorySlug: 'users-permissions', slug: 'revoking-sessions', titleAr: 'إلغاء جلسات المستخدم', titleEn: 'Revoking user sessions', summaryAr: 'تسجيل خروج المستخدم من كل الأجهزة.', summaryEn: 'Signing a user out of all devices.', keywords: ['جلسات', 'sessions', 'إلغاء'], articleType: 'STEP_BY_STEP', difficulty: 'BASIC', featureKey: 'users', routePatterns: ['/users'], sortOrder: 5, contentAr: '<p>استخدم <strong>إلغاء الجلسات</strong> عند الاشتباه باختراق حساب؛ يُسجَّل المستخدم خارجًا فورًا.</p>', contentEn: '<p>Use <strong>Revoke sessions</strong> when you suspect an account is compromised; the user is signed out immediately.</p>' },
  { categorySlug: 'troubleshooting', slug: 'meta-access-token-expired', titleAr: 'رمز وصول Meta منتهي الصلاحية', titleEn: 'Troubleshooting an expired Meta access token', summaryAr: 'تشخيص وإصلاح أخطاء الرمز المميز.', summaryEn: 'Diagnosing and fixing token errors.', keywords: ['token', 'منتهي', 'expired'], articleType: 'TROUBLESHOOTING', difficulty: 'INTERMEDIATE', featureKey: 'whatsapp', routePatterns: ['/whatsapp'], isFeatured: true, sortOrder: 1, contentAr: `
<div class="goal">الهدف: إصلاح أخطاء المصادقة من Meta.</div>
<h2>الأعراض</h2>
<ul><li>رسالة «Malformed access token».</li><li>فشل اختبار الاتصال برمز 190.</li><li>تعذر مزامنة القوالب.</li></ul>
<h2>الحل</h2>
<ol>
<li>أنشئ رمز وصول جديدًا في Meta.</li>
<li>استبدل الرمز في صفحة واتساب.</li>
<li>احفظ ثم اختبر الاتصال.</li>
</ol>
<div class="success">النتيجة: اختبار الاتصال ينجح وتعود المزامنة للعمل.</div>`,
    contentEn: `
<div class="goal">Goal: fix authentication errors from Meta.</div>
<h2>Symptoms</h2>
<ul><li>“Malformed access token” message.</li><li>Connection test fails with code 190.</li><li>Template sync fails.</li></ul>
<h2>Solution</h2>
<ol>
<li>Generate a new access token in Meta.</li>
<li>Replace the token on the WhatsApp page.</li>
<li>Save, then test the connection.</li>
</ol>
<div class="success">Result: the connection test passes and sync works again.</div>`,
  },
  { categorySlug: 'troubleshooting', slug: 'webhook-not-receiving', titleAr: 'الويب هوك لا يستقبل الأحداث', titleEn: 'Webhook not receiving events', summaryAr: 'تشخيص الرسائل غير الواردة.', summaryEn: 'Diagnosing messages that do not arrive.', keywords: ['webhook', 'ويب هوك', 'أحداث'], articleType: 'TROUBLESHOOTING', difficulty: 'ADVANCED', featureKey: 'whatsapp', routePatterns: ['/whatsapp'], sortOrder: 2, contentAr: '<ol><li>تحقق من Verify Token المطابق.</li><li>تأكد من اشتراك حقل messages.</li><li>راجع سجل التكامل لأي أحداث مرفوضة.</li></ol>', contentEn: '<ol><li>Check that the Verify Token matches.</li><li>Ensure the messages field is subscribed.</li><li>Review the integration log for rejected events.</li></ol>' },
  { categorySlug: 'troubleshooting', slug: 'campaign-cannot-start', titleAr: 'الحملة لا يمكن أن تبدأ', titleEn: 'Campaign cannot start', summaryAr: 'أسباب منع الإطلاق.', summaryEn: 'Reasons launch is blocked.', keywords: ['حملة', 'campaign', 'بدء'], articleType: 'TROUBLESHOOTING', difficulty: 'INTERMEDIATE', featureKey: 'campaigns', routePatterns: ['/campaigns'], sortOrder: 3, contentAr: '<p>راجع الفحص المسبق. الأسباب الشائعة: قالب غير معتمد، لا جمهور، متغيرات ناقصة، أو تعليق في قائمة الانتظار.</p>', contentEn: '<p>Review preflight. Common causes: unapproved template, no audience, missing variables, or a paused queue.</p>' },
  { categorySlug: 'troubleshooting', slug: 'message-failed', titleAr: 'فشل رسالة', titleEn: 'Message failed', summaryAr: 'أسباب فشل الإرسال.', summaryEn: 'Reasons a send fails.', keywords: ['فشل', 'failed', 'رسالة'], articleType: 'TROUBLESHOOTING', difficulty: 'INTERMEDIATE', featureKey: 'campaigns', routePatterns: ['/campaigns'], sortOrder: 4, contentAr: '<p>راجع رمز السبب على المستلم. أعد المحاولة للأخطاء المؤقتة فقط، وتحقق من صحة الرقم والحظر.</p>', contentEn: '<p>Check the reason code on the recipient. Retry only transient errors, and verify the number and block state.</p>' },
  { categorySlug: 'troubleshooting', slug: 'reply-not-in-inbox', titleAr: 'الرد لا يظهر في البريد الوارد', titleEn: 'Reply not appearing in Inbox', summaryAr: 'تشخيص الردود المفقودة.', summaryEn: 'Diagnosing missing replies.', keywords: ['رد', 'reply', 'بريد وارد'], articleType: 'TROUBLESHOOTING', difficulty: 'ADVANCED', featureKey: 'inbox', routePatterns: ['/inbox'], sortOrder: 5, contentAr: '<p>تحقق من عمل الويب هوك وعدم فشل معالجة الحدث في سجل التكامل، وتأكد من وجود محادثة نشطة للرقم.</p>', contentEn: '<p>Check that the webhook works and the event was not dropped in the integration log, and that an active conversation exists for the number.</p>' },
  { categorySlug: 'troubleshooting', slug: 'file-upload-failed', titleAr: 'فشل رفع ملف', titleEn: 'File upload failed', summaryAr: 'الملفات غير المدعومة والكبيرة.', summaryEn: 'Unsupported and oversized files.', keywords: ['ملف', 'file', 'رفع'], articleType: 'TROUBLESHOOTING', difficulty: 'BASIC', featureKey: 'inbox', routePatterns: ['/inbox'], sortOrder: 6, contentAr: '<p>تحقق من نوع الملف وحجمه. اضغط صورة أو حوّل الملف ثم أعد المحاولة.</p>', contentEn: '<p>Check the file type and size. Compress the image or convert the file, then retry.</p>' },
  { categorySlug: 'troubleshooting', slug: 'import-file-rejected', titleAr: 'رفض ملف الاستيراد', titleEn: 'Import file rejected', summaryAr: 'أخطاء رفع ملفات الاستيراد.', summaryEn: 'Import upload errors.', keywords: ['استيراد', 'import', 'رفض'], articleType: 'TROUBLESHOOTING', difficulty: 'BASIC', featureKey: 'imports', routePatterns: ['/imports'], sortOrder: 7, contentAr: '<p>تأكد من الامتداد (csv/xlsx) والصيغة وحجم الملف. صحح ثم أعد الرفع.</p>', contentEn: '<p>Check the extension (csv/xlsx), the format, and the file size. Fix and re-upload.</p>' },
  { categorySlug: 'troubleshooting', slug: 'queue-worker-unavailable', titleAr: 'عامل قائمة الانتظار غير متاح', titleEn: 'Queue worker unavailable', summaryAr: 'تأخر معالجة المهام.', summaryEn: 'Delayed job processing.', keywords: ['قائمة انتظار', 'queue', 'worker'], articleType: 'TROUBLESHOOTING', difficulty: 'ADVANCED', featureKey: 'operations', routePatterns: ['/operations'], sortOrder: 8, contentAr: '<p>تأكد من تشغيل عملية العامل (worker) واتصال Redis. راجع صفحة العمليات لحالة القوائم.</p>', contentEn: '<p>Ensure the worker process is running and Redis is reachable. Check the operations page for queue health.</p>' },
  { categorySlug: 'troubleshooting', slug: 'reports-not-updated', titleAr: 'التقارير لا تتحدث', titleEn: 'Reports not updated', summaryAr: 'تأخر تحديث الأرقام.', summaryEn: 'Delayed number updates.', keywords: ['تقارير', 'reports', 'تحديث'], articleType: 'TROUBLESHOOTING', difficulty: 'BASIC', featureKey: 'reports', routePatterns: ['/reports'], sortOrder: 9, contentAr: '<p>تتحدث التقارير بعد معالجة أحداث الويب هوك. تحقق من سجل التكامل ومن عامل المعالجة.</p>', contentEn: '<p>Reports update after webhook processing. Check the integration log and the processing worker.</p>' },
  { categorySlug: 'security-policies', slug: 'protecting-meta-credentials', titleAr: 'حماية بيانات Meta', titleEn: 'Protecting Meta credentials', summaryAr: 'أفضل ممارسات أمان بيانات الاعتماد.', summaryEn: 'Credential security best practices.', keywords: ['meta', 'بيانات اعتماد', 'أمان'], articleType: 'POLICY', difficulty: 'BASIC', featureKey: 'settings', routePatterns: ['/settings'], sortOrder: 1, contentAr: '<p>تُخزَّن بيانات Meta مشفرة. لا تشاركها خارج المنصة، وبدّل رمز الوصول دوريًا.</p>', contentEn: '<p>Meta credentials are stored encrypted. Do not share them outside the platform, and rotate the access token regularly.</p>' },
  { categorySlug: 'security-policies', slug: 'customer-data-handling', titleAr: 'التعامل مع بيانات العملاء', titleEn: 'Customer data handling', summaryAr: 'سياسة التعامل مع البيانات الشخصية.', summaryEn: 'Personal data handling policy.', keywords: ['بيانات', 'data', 'خصوصية'], articleType: 'POLICY', difficulty: 'INTERMEDIATE', sortOrder: 2, contentAr: '<p>تعامل مع بيانات العملاء وفق قوانين الخصوصية في بلدك، وقيّد الوصول حسب الأدوار، وتصدير التقارير بأمان.</p>', contentEn: '<p>Handle customer data per your local privacy laws, restrict access by role, and export reports securely.</p>' },
  { categorySlug: 'security-policies', slug: 'using-audit-logs', titleAr: 'استخدام سجلات التدقيق', titleEn: 'Using audit logs', summaryAr: 'من فعل ماذا ومتى.', summaryEn: 'Who did what and when.', keywords: ['تدقيق', 'audit', 'سجلات'], articleType: 'REFERENCE', difficulty: 'BASIC', featureKey: 'audit-log', routePatterns: ['/audit-log'], sortOrder: 3, contentAr: '<p>يعرض سجل التدقيق كل الإجراءات الحساسة مع المستخدم والتوقيت. راجعه دوريًا.</p>', contentEn: '<p>The audit log shows every sensitive action with the user and timestamp. Review it regularly.</p>' },
  { categorySlug: 'security-policies', slug: 'safe-campaign-messaging', titleAr: 'الاستخدام الآمن لرسائل الحملات', titleEn: 'Safe use of campaign messaging', summaryAr: 'تجنب الحظر والرسائل العشوائية.', summaryEn: 'Avoiding blocks and spam complaints.', keywords: ['رسائل', 'messaging', 'آمن'], articleType: 'POLICY', difficulty: 'INTERMEDIATE', featureKey: 'campaigns', routePatterns: ['/campaigns'], sortOrder: 4, contentAr: '<p>أرسل فقط لمن أعطوا الموافقة، واحترم الإلغاء الفوري، وتجنب الادعاءات الممنوعة في القوالب.</p>', contentEn: '<p>Only message opted-in customers, honor opt-outs immediately, and avoid disallowed claims in templates.</p>' },
];

async function main(): Promise<void> {
  const env = parseApiEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool, { schema: { helpCategories, helpArticles } });

  const categoryCount = await db.select().from(helpCategories);
  if (categoryCount.length > 0) {
    console.log(`Help Center already seeded (${categoryCount.length} categories); skipping.`);
    await pool.end();
    return;
  }

  const categoryIdBySlug = new Map<string, string>();
  for (const category of CATEGORIES) {
    const [row] = await db
      .insert(helpCategories)
      .values({
        slug: category.slug,
        nameAr: category.nameAr,
        nameEn: category.nameEn,
        descriptionAr: category.descriptionAr,
        descriptionEn: category.descriptionEn,
        icon: category.icon,
        sortOrder: category.sortOrder,
        status: 'PUBLISHED',
      })
      .returning();
    categoryIdBySlug.set(category.slug, row!.id);
  }

  const all = [...CRITICAL_ARTICLES, ...OTHER_ARTICLES];
  let published = 0;
  for (const article of all) {
    const categoryId = categoryIdBySlug.get(article.categorySlug);
    if (!categoryId) {
      console.warn(`Unknown category ${article.categorySlug} for article ${article.slug}; skipping.`);
      continue;
    }
    const exists = await db.query.helpArticles.findFirst({ where: eq(helpArticles.slug, article.slug) });
    if (exists) {
      continue;
    }
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
      articleType: article.articleType,
      difficulty: article.difficulty,
      estimatedReadingMinutes: 2,
      allowedRoles: article.allowedRoles ?? null,
      routePatterns: article.routePatterns ?? null,
      featureKey: article.featureKey ?? null,
      keywords: article.keywords ?? null,
      sortOrder: article.sortOrder,
      isFeatured: article.isFeatured ?? false,
      isContextual: true,
      publishedAt: new Date(),
    });
    published += 1;
  }

  console.log(`Seeded ${CATEGORIES.length} categories and ${published} articles.`);
  await pool.end();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
