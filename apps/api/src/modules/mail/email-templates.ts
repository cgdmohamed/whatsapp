import type { Language } from '@wa/shared';

export type EmailVars = Record<string, string | number | null | undefined>;

export interface EmailTemplateDef {
  key: string;
  subjectAr: string;
  subjectEn: string;
  body: (vars: EmailVars, lang: Language, app: AppContext) => { html: string; text: string };
}

export interface AppContext {
  appName: string;
  appUrl: string;
  companyName: string;
  supportEmail: string;
}

function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(value: string | number | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  return date.toLocaleString('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function renderLayout(lang: Language, app: AppContext, title: string, bodyHtml: string): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const company = escapeHtml(app.companyName || app.appName);
  const support = app.supportEmail
    ? `<p style="color:#64748b;font-size:13px;line-height:1.6;">${lang === 'ar' ? 'للمساعدة تواصل معنا:' : 'Need help? Contact us:'} <a href="mailto:${escapeHtml(app.supportEmail)}" style="color:#0e9f6e;">${escapeHtml(app.supportEmail)}</a></p>`
    : '';
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background-color:#0e9f6e;padding:20px 28px;color:#ffffff;">
          <h1 style="margin:0;font-size:18px;font-weight:600;">${company}</h1>
        </td></tr>
        <tr><td style="padding:28px;">
          <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#0f172a;">${title}</h2>
          ${bodyHtml}
          ${support}
          <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
            ${lang === 'ar' ? 'هذه رسالة نظامية تلقائية. يرجى عدم الرد عليها.' : 'This is an automated system message. Please do not reply.'}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function callout(kind: 'note' | 'warning' | 'success', lang: Language, text: string): string {
  const colors: Record<string, { border: string; bg: string; label: string }> = {
    note: { border: '#3b82f6', bg: '#eff6ff', label: lang === 'ar' ? 'ملاحظة' : 'Note' },
    warning: { border: '#f59e0b', bg: '#fffbeb', label: lang === 'ar' ? 'تنبيه أمني' : 'Security notice' },
    success: { border: '#0e9f6e', bg: '#ecfdf5', label: lang === 'ar' ? 'تم بنجاح' : 'Done' },
  };
  const c = colors[kind]!;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;"><tr><td style="background:${c.bg};border-inline-start:3px solid ${c.border};border-radius:6px;padding:10px 14px;font-size:13px;color:#334155;"><strong>${c.label}: </strong>${text}</td></tr></table>`;
}

function buttonLink(_lang: Language, label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0;"><tr><td><a href="${escapeHtml(url)}" style="background-color:#0e9f6e;color:#ffffff;padding:10px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;display:inline-block;">${escapeHtml(label)}</a></td></tr></table>`;
}

function infoTable(rows: Array<[string, string]>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;border-collapse:collapse;">
    ${rows
      .map(
        ([key, value]) => `<tr><td style="border:1px solid #e2e8f0;padding:8px 12px;background:#f8fafc;color:#475569;font-size:13px;width:40%;">${escapeHtml(key)}</td><td style="border:1px solid #e2e8f0;padding:8px 12px;font-size:13px;color:#0f172a;">${escapeHtml(value)}</td></tr>`,
      )
      .join('')}
  </table>`;
}

const p = (text: string) => `<p style="margin:10px 0;font-size:14px;line-height:1.7;color:#334155;">${text}</p>`;

export const EMAIL_TEMPLATES: Record<string, EmailTemplateDef> = {
  'password-reset-request': {
    key: 'password-reset-request',
    subjectAr: 'إعادة تعيين كلمة المرور',
    subjectEn: 'Password reset request',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'طلب إعادة تعيين كلمة المرور' : 'Password reset request';
      const html = [
        p(lang === 'ar' ? 'تلقينا طلبًا لإعادة تعيين كلمة المرور لحسابك.' : 'We received a request to reset the password for your account.'),
        p(lang === 'ar' ? 'اضغط الزر أدناه خلال الوقت المحدد لإعادة تعيين كلمة المرور. الرابط صالح لمرة واحدة فقط.' : 'Click the button below within the time limit to reset your password. The link is single-use.'),
        buttonLink(lang, lang === 'ar' ? 'إعادة تعيين كلمة المرور' : 'Reset password', String(vars.resetUrl ?? '')),
        callout('warning', lang, lang === 'ar' ? 'إذا لم تطلب هذا، تجاهل هذه الرسالة واتصل بالمسؤول.' : 'If you did not request this, ignore this message and contact your administrator.'),
      ].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'password-reset-confirmation': {
    key: 'password-reset-confirmation',
    subjectAr: 'تم تغيير كلمة المرور',
    subjectEn: 'Password changed',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'تم إعادة تعيين كلمة المرور' : 'Your password was reset';
      const html = [
        p(lang === 'ar' ? 'تم تغيير كلمة مرور حسابك بنجاح.' : 'Your account password was changed successfully.'),
        infoTable([
          [lang === 'ar' ? 'التاريخ والوقت' : 'Date and time', formatDateTime(vars.changedAt)],
          [lang === 'ar' ? 'العنوان' : 'Address', String(vars.ip ?? '')],
        ]),
        callout('warning', lang, lang === 'ar' ? 'إذا لم تكن أنت من غيّرها، تواصل مع المسؤول فورًا.' : 'If you did not change it, contact your administrator immediately.'),
      ].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'password-changed': {
    key: 'password-changed',
    subjectAr: 'تم تغيير كلمة المرور',
    subjectEn: 'Password changed',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'تم تغيير كلمة مرورك' : 'Your password was changed';
      const html = [
        p(lang === 'ar' ? 'تم تغيير كلمة مرور حسابك.' : 'Your account password was changed.'),
        infoTable([
          [lang === 'ar' ? 'التاريخ والوقت' : 'Date and time', formatDateTime(vars.changedAt)],
        ]),
        callout('warning', lang, lang === 'ar' ? 'إذا لم تكن أنت من فعل ذلك، أعد تعيين كلمة مرورك فورًا.' : 'If this was not you, reset your password immediately.'),
      ].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'account-created': {
    key: 'account-created',
    subjectAr: 'تم إنشاء حسابك',
    subjectEn: 'Your account was created',
    body: (_vars, lang, app) => {
      const title = lang === 'ar' ? 'مرحبًا بك!' : 'Welcome!';
      const html = [
        p(lang === 'ar' ? `تم إنشاء حسابك في ${escapeHtml(app.companyName)} بنجاح.` : `Your account at ${escapeHtml(app.companyName)} was created successfully.`),
        p(lang === 'ar' ? 'للوصول إلى المنصة افتح الرابط أدناه وسجّل الدخول ببياناتك.' : 'Open the link below and sign in with your credentials.'),
        buttonLink(lang, lang === 'ar' ? 'فتح المنصة' : 'Open the platform', app.appUrl),
      ].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'account-activated': {
    key: 'account-activated',
    subjectAr: 'تم تفعيل حسابك',
    subjectEn: 'Your account was activated',
    body: (_vars, lang, app) => {
      const title = lang === 'ar' ? 'تم تفعيل حسابك' : 'Your account was activated';
      const html = [p(lang === 'ar' ? 'يمكنك الآن تسجيل الدخول واستخدام المنصة.' : 'You can now sign in and use the platform.')].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'account-suspended': {
    key: 'account-suspended',
    subjectAr: 'تم إيقاف حسابك',
    subjectEn: 'Your account was suspended',
    body: (_vars, lang, app) => {
      const title = lang === 'ar' ? 'تم إيقاف حسابك مؤقتًا' : 'Your account was suspended';
      const html = [
        p(lang === 'ar' ? 'تم إيقاف حسابك مؤقتًا من قبل المسؤول.' : 'Your account was temporarily suspended by an administrator.'),
        callout('warning', lang, lang === 'ar' ? 'إذا كانت لديك أسئلة، تواصل مع مسؤول النظام.' : 'If you have questions, contact your system administrator.'),
      ].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'admin-password-reset': {
    key: 'admin-password-reset',
    subjectAr: 'إعادة تعيين كلمة المرور من المسؤول',
    subjectEn: 'Administrator password reset',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'طلب إعادة تعيين كلمة المرور' : 'Password reset requested';
      const html = [
        p(lang === 'ar' ? 'طلب مسؤول إعادة تعيين كلمة مرورك. اضغط الزر أدناه لإنشاء كلمة مرور جديدة.' : 'An administrator requested a password reset for your account. Click the button below to set a new password.'),
        buttonLink(lang, lang === 'ar' ? 'إعادة تعيين كلمة المرور' : 'Reset password', String(vars.resetUrl ?? '')),
        callout('warning', lang, lang === 'ar' ? 'الرابط صالح لمرة واحدة ولفترة محدودة.' : 'The link is single-use and time-limited.'),
      ].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'new-login-alert': {
    key: 'new-login-alert',
    subjectAr: 'تسجيل دخول جديد',
    subjectEn: 'New sign-in detected',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'تم تسجيل دخول جديد إلى حسابك' : 'New sign-in to your account';
      const html = [
        p(lang === 'ar' ? 'تم تسجيل الدخول إلى حسابك من جهاز جديد.' : 'A new device signed in to your account.'),
        infoTable([
          [lang === 'ar' ? 'التاريخ والوقت' : 'Date and time', formatDateTime(vars.at)],
          [lang === 'ar' ? 'العنوان' : 'Address', String(vars.ip ?? '')],
          [lang === 'ar' ? 'المتصفح' : 'User agent', String(vars.userAgent ?? '')],
        ]),
        callout('warning', lang, lang === 'ar' ? 'إذا لم يكن هذا أنت، غيّر كلمة مرورك وألغِ الجلسات.' : 'If this was not you, change your password and revoke sessions.'),
      ].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'sessions-revoked': {
    key: 'sessions-revoked',
    subjectAr: 'تم إلغاء جميع الجلسات',
    subjectEn: 'All sessions revoked',
    body: (_vars, lang, app) => {
      const title = lang === 'ar' ? 'تم إلغاء جميع جلساتك' : 'All of your sessions were revoked';
      const html = [p(lang === 'ar' ? 'تم تسجيل خروجك من جميع الأجهزة. ستحتاج إلى تسجيل الدخول من جديد.' : 'You were signed out of all devices. Sign in again to continue.')].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'campaign-scheduled': {
    key: 'campaign-scheduled',
    subjectAr: 'تمت جدولة حملة',
    subjectEn: 'Campaign scheduled',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'تمت جدولة حملة' : 'Campaign scheduled';
      const html = [infoTable([[lang === 'ar' ? 'الحملة' : 'Campaign', String(vars.campaignName ?? '')], [lang === 'ar' ? 'وقت الإرسال' : 'Send time', formatDateTime(vars.scheduledAt)]])].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'campaign-started': {
    key: 'campaign-started',
    subjectAr: 'بدأت الحملة',
    subjectEn: 'Campaign started',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'بدأت الحملة' : 'Campaign started';
      const html = [infoTable([[lang === 'ar' ? 'الحملة' : 'Campaign', String(vars.campaignName ?? '')], [lang === 'ar' ? 'المستلمون' : 'Recipients', String(vars.recipients ?? '')]])].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'campaign-completed': {
    key: 'campaign-completed',
    subjectAr: 'اكتملت الحملة',
    subjectEn: 'Campaign completed',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'اكتملت الحملة' : 'Campaign completed';
      const html = [infoTable([[lang === 'ar' ? 'الحملة' : 'Campaign', String(vars.campaignName ?? '')], [lang === 'ar' ? 'أُرسلت' : 'Sent', String(vars.sent ?? '')], [lang === 'ar' ? 'سُلّمت' : 'Delivered', String(vars.delivered ?? '')], [lang === 'ar' ? 'فشلت' : 'Failed', String(vars.failed ?? '')]])].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'campaign-failed': {
    key: 'campaign-failed',
    subjectAr: 'فشلت الحملة',
    subjectEn: 'Campaign failed',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'فشلت الحملة' : 'Campaign failed';
      const html = [p(lang === 'ar' ? 'واجهت الحملة مشكلة ولم تكتمل.' : 'The campaign ran into a problem and did not complete.'), infoTable([[lang === 'ar' ? 'الحملة' : 'Campaign', String(vars.campaignName ?? '')], [lang === 'ar' ? 'السبب' : 'Reason', String(vars.reason ?? '')]])].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'campaign-paused': {
    key: 'campaign-paused',
    subjectAr: 'تم إيقاف الحملة تلقائيًا',
    subjectEn: 'Campaign paused automatically',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'تم إيقاف الحملة تلقائيًا' : 'Campaign paused automatically';
      const html = [p(lang === 'ar' ? 'تم إيقاف الحملة تلقائيًا لتجاوز حد الفشل أو الاستبعاد.' : 'The campaign was paused automatically because a rate threshold was exceeded.'), infoTable([[lang === 'ar' ? 'الحملة' : 'Campaign', String(vars.campaignName ?? '')]])].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'meta-connection-failed': {
    key: 'meta-connection-failed',
    subjectAr: 'فشل اتصال Meta',
    subjectEn: 'Meta connection failed',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'فشل اختبار اتصال Meta' : 'Meta connection test failed';
      const html = [p(lang === 'ar' ? 'فشل اختبار الاتصال بـ Meta WhatsApp Cloud API.' : 'The connection test to the Meta WhatsApp Cloud API failed.'), infoTable([[lang === 'ar' ? 'الخطأ' : 'Error', String(vars.error ?? '')], [lang === 'ar' ? 'التاريخ والوقت' : 'Date and time', formatDateTime(vars.at)]])].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'meta-access-token-issue': {
    key: 'meta-access-token-issue',
    subjectAr: 'مشكلة في رمز وصول Meta',
    subjectEn: 'Meta access token issue',
    body: (_vars, lang, app) => {
      const title = lang === 'ar' ? 'مشكلة في رمز وصول Meta' : 'Meta access token issue';
      const html = [p(lang === 'ar' ? 'يبدو أن رمز وصول Meta أصبح غير صالح. أعد إنشاء الرمز واستبدله في الإعدادات.' : 'Your Meta access token appears to be invalid. Recreate it and replace it in settings.')].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'template-rejected': {
    key: 'template-rejected',
    subjectAr: 'تم رفض قالب',
    subjectEn: 'Template rejected',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'تم رفض قالب الرسالة' : 'Message template rejected';
      const html = [infoTable([[lang === 'ar' ? 'القالب' : 'Template', String(vars.templateName ?? '')], [lang === 'ar' ? 'السبب' : 'Reason', String(vars.reason ?? '')]])].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'template-paused-disabled': {
    key: 'template-paused-disabled',
    subjectAr: 'تم إيقاف القالب',
    subjectEn: 'Template paused or disabled',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'تم إيقاف قالب أو تعطيله' : 'Template paused or disabled';
      const html = [p(lang === 'ar' ? 'أصبح أحد القوالب المعتمدة متوقفًا أو معطلاً ولن يُرسل بعد الآن.' : 'An approved template is now paused or disabled and will not send.'), infoTable([[lang === 'ar' ? 'القالب' : 'Template', String(vars.templateName ?? '')]])].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'queue-worker-unavailable': {
    key: 'queue-worker-unavailable',
    subjectAr: 'عامل المعالجة غير متاح',
    subjectEn: 'Processing worker unavailable',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'عامل المعالجة غير متاح' : 'A background worker is unavailable';
      const html = [p(lang === 'ar' ? 'أبلغ عن عدم توفر أحد عمال المعالجة الخلفية. تحقق من حالة العمليات.' : 'A background worker was reported unavailable. Check the operations status.'), infoTable([[lang === 'ar' ? 'القائمة' : 'Queue', String(vars.queue ?? '')], [lang === 'ar' ? 'التاريخ والوقت' : 'Date and time', formatDateTime(vars.at)]])].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'import-completed': {
    key: 'import-completed',
    subjectAr: 'اكتمل الاستيراد',
    subjectEn: 'Import completed',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'اكتمل استيراد جهات الاتصال' : 'Contact import completed';
      const html = [infoTable([[lang === 'ar' ? 'الملف' : 'File', String(vars.fileName ?? '')], [lang === 'ar' ? 'تم إنشاؤه' : 'Created', String(vars.created ?? '')], [lang === 'ar' ? 'تم تحديثه' : 'Updated', String(vars.updated ?? '')], [lang === 'ar' ? 'مرفوض' : 'Rejected', String(vars.rejected ?? '')]])].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'import-failed': {
    key: 'import-failed',
    subjectAr: 'فشل الاستيراد',
    subjectEn: 'Import failed',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'فشل استيراد جهات الاتصال' : 'Contact import failed';
      const html = [p(lang === 'ar' ? 'فشل معالجة ملف الاستيراد.' : 'The import file failed to process.'), infoTable([[lang === 'ar' ? 'الملف' : 'File', String(vars.fileName ?? '')], [lang === 'ar' ? 'السبب' : 'Reason', String(vars.reason ?? '')]])].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'budget-alert': {
    key: 'budget-alert',
    subjectAr: 'تنبيه الميزانية',
    subjectEn: 'Budget alert',
    body: (vars, lang, app) => {
      const level = String(vars.level ?? 'WARNING');
      const title = lang === 'ar' ? 'تنبيه استهلاك الميزانية' : 'Budget usage alert';
      const rows: Array<[string, string]> = [
        [lang === 'ar' ? 'سياسة الميزانية' : 'Budget policy', String(vars.policyName ?? '')],
        [lang === 'ar' ? 'النطاق' : 'Scope', String(vars.scopeType ?? '')],
        [lang === 'ar' ? 'الفترة' : 'Period', String(vars.periodType ?? '')],
        [lang === 'ar' ? 'الحد الأقصى' : 'Limit', `${String(vars.currency ?? '')} ${String(vars.amountLimit ?? '')}`],
        [lang === 'ar' ? 'الاستهلاك الحالي' : 'Current usage', `${String(vars.currency ?? '')} ${String(vars.totalUsage ?? '')}`],
        [lang === 'ar' ? 'نسبة الاستهلاك' : 'Usage percentage', `${String(vars.usagePercentage ?? '')}%`],
        [lang === 'ar' ? 'الحالة' : 'Status', level],
      ];
      const note =
        level === 'BLOCKED'
          ? callout('warning', lang, lang === 'ar' ? 'تم تفعيل الإيقاف التلقائي لمنع المزيد من الإنفاق.' : 'The hard stop is now active to prevent further spend.')
          : level === 'CRITICAL'
            ? callout('warning', lang, lang === 'ar' ? 'الميزانية على وشك النفاد. راجع الاستهلاك فورًا.' : 'The budget is about to run out. Review usage immediately.')
            : callout('note', lang, lang === 'ar' ? 'اقتربت الميزانية من حد التحذير. راجع الإنفاق.' : 'The budget is approaching the warning threshold. Review your spend.');
      const html = [p(lang === 'ar' ? 'تجاوز استهلاك الميزانية أحد الحدود المحددة.' : 'Budget usage has crossed a configured threshold.'), infoTable(rows), note].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'daily-summary': {
    key: 'daily-summary',
    subjectAr: 'الملخص اليومي للإدارة',
    subjectEn: 'Daily management summary',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'الملخص اليومي' : 'Daily management summary';
      const rows: Array<[string, string]> = [
        [lang === 'ar' ? 'حملات مكتملة' : 'Campaigns completed', String(vars.campaignsCompleted ?? '')],
        [lang === 'ar' ? 'رسائل مرسلة' : 'Messages sent', String(vars.messagesSent ?? '')],
        [lang === 'ar' ? 'مسلّمة' : 'Delivered', String(vars.delivered ?? '')],
        [lang === 'ar' ? 'مقروءة' : 'Read', String(vars.read ?? '')],
        [lang === 'ar' ? 'ردود' : 'Replies', String(vars.replies ?? '')],
        [lang === 'ar' ? 'فاشلة' : 'Failed', String(vars.failed ?? '')],
        [lang === 'ar' ? 'إلغاء اشتراك' : 'Opt-outs', String(vars.optOuts ?? '')],
        [lang === 'ar' ? 'محادثات مفتوحة' : 'Open conversations', String(vars.openConversations ?? '')],
        [lang === 'ar' ? 'محادثات غير مسندة' : 'Unassigned conversations', String(vars.unassignedConversations ?? '')],
        [lang === 'ar' ? 'استيرادات فاشلة' : 'Failed imports', String(vars.failedImports ?? '')],
      ];
      const html = [infoTable(rows), p(lang === 'ar' ? 'التاريخ: ' + String(vars.date ?? '') : 'Date: ' + String(vars.date ?? ''))].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'test-email': {
    key: 'test-email',
    subjectAr: 'رسالة اختبار',
    subjectEn: 'Test email',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'رسالة اختبار من المنصة' : 'Test email from the platform';
      const html = [
        p(lang === 'ar' ? 'هذه رسالة اختبار للتأكد من أن إعدادات البريد تعمل بشكل صحيح.' : 'This is a test message to confirm your email settings work correctly.'),
        infoTable([[lang === 'ar' ? 'التاريخ والوقت' : 'Date and time', formatDateTime(vars.sentAt)]]),
      ].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
  'temp-password': {
    key: 'temp-password',
    subjectAr: 'كلمة مرور مؤقتة',
    subjectEn: 'Temporary password',
    body: (vars, lang, app) => {
      const title = lang === 'ar' ? 'كلمة مرور مؤقتة' : 'Temporary password';
      const html = [
        p(lang === 'ar' ? 'أنشأ مسؤول كلمة مرور مؤقتة لحسابك. استخدمها لتسجيل الدخول، وسيُطلب منك تغييرها فورًا.' : 'An administrator created a temporary password for your account. Use it to sign in — you will be required to change it immediately.'),
        callout('note', lang, lang === 'ar' ? 'كلمة المرور المؤقتة: ' + String(vars.tempPassword ?? '') : 'Temporary password: ' + String(vars.tempPassword ?? '')),
        callout('warning', lang, lang === 'ar' ? 'احذف هذه الرسالة بعد تسجيل الدخول ولا تشارك كلمة المرور.' : 'Delete this message after signing in and do not share the password.'),
        buttonLink(lang, lang === 'ar' ? 'فتح المنصة' : 'Open the platform', app.appUrl),
      ].join('');
      return { html: renderLayout(lang, app, title, html), text: stripHtml(html) };
    },
  },
};

export const EMAIL_TEMPLATE_KEYS = Object.keys(EMAIL_TEMPLATES);
