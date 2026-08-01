import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  toast,
} from '@wa/ui';
import { Mail, RefreshCw, Send } from 'lucide-react';

import { PageHeader } from '../components/page-header';
import { ContextualHelpButton } from '../features/help/help-drawer-provider';
import {
  useEmailLogs,
  useMailSettings,
  useRetryEmail,
  useSaveDailySummary,
  useSaveMailSettings,
  useSendTestEmail,
  useTestSmtpConnection,
} from '../features/mail/api';

export function EmailSettingsPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useMailSettings();
  const saveSettings = useSaveMailSettings();
  const testConnection = useTestSmtpConnection();
  const sendTest = useSendTestEmail();
  const saveSummary = useSaveDailySummary();
  const { data: failedLogs } = useEmailLogs('FAILED');
  const retry = useRetryEmail();

  const [host, setHost] = React.useState('');
  const [port, setPort] = React.useState(587);
  const [secure, setSecure] = React.useState(true);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fromEmail, setFromEmail] = React.useState('');
  const [fromName, setFromName] = React.useState('');
  const [replyTo, setReplyTo] = React.useState('');
  const [testTo, setTestTo] = React.useState('');
  const [testLang, setTestLang] = React.useState('ar');
  const [summaryEnabled, setSummaryEnabled] = React.useState(false);
  const [summaryTime, setSummaryTime] = React.useState('08:00');
  const [summaryRecipients, setSummaryRecipients] = React.useState('');

  React.useEffect(() => {
    if (data) {
      setHost(data.email.host);
      setPort(data.email.port);
      setSecure(data.email.secure);
      setUsername(data.email.username);
      setFromEmail(data.email.fromEmail);
      setFromName(data.email.fromName);
      setReplyTo(data.email.replyTo);
      setSummaryEnabled(data.dailySummary.enabled);
      setSummaryTime(data.dailySummary.time);
      setSummaryRecipients(data.dailySummary.recipients.join('\n'));
    }
  }, [data]);

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const handleSave = async () => {
    try {
      await saveSettings.mutateAsync({
        host, port, secure, username, fromEmail, fromName, replyTo: replyTo || undefined,
        ...(password ? { password } : {}),
      });
      setPassword('');
      toast.success(t('common.success'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleTest = async () => {
    const result = await testConnection.mutateAsync();
    if (result.ok) toast.success(t('mailSettings.connectionTestOk'));
    else toast.error(t('mailSettings.connectionTestFailed', { error: result.error ?? '' }));
  };

  const handleSendTest = async () => {
    if (!testTo.trim()) return;
    try {
      await sendTest.mutateAsync({ to: testTo.trim(), language: testLang });
      toast.success(t('mailSettings.testSent'));
    } catch {
      toast.error(t('mailSettings.testFailed'));
    }
  };

  const handleSaveSummary = async () => {
    const recipients = summaryRecipients.split('\n').map((value) => value.trim()).filter(Boolean);
    try {
      await saveSummary.mutateAsync({ enabled: summaryEnabled, time: summaryTime, recipients });
      toast.success(t('common.success'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const email = data?.email;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('mailSettings.title')}
        description={t('mailSettings.description')}
        actions={<ContextualHelpButton featureKey="settings" />}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <CardTitle className="text-base">{t('mailSettings.status')}</CardTitle>
          </div>
          <Badge variant={email?.enabled ? 'success' : 'destructive'}>{email?.enabled ? t('mailSettings.enabled') : t('mailSettings.disabled')}</Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            {t('mailSettings.lastTestAt', { date: email?.lastTestAt ? new Date(email.lastTestAt).toLocaleString() : '—' })}
          </p>
          <p className="text-muted-foreground">
            {t('mailSettings.lastSentAt', { date: email?.lastSentAt ? new Date(email.lastSentAt).toLocaleString() : '—' })}
          </p>
          <p className="text-muted-foreground">
            {t('mailSettings.lastFailedAt', { date: email?.lastFailedAt ? new Date(email.lastFailedAt).toLocaleString() : '—' })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('mailSettings.smtp')}</CardTitle>
          <CardDescription />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1"><Label>{t('mailSettings.host')}</Label><Input dir="ltr" value={host} onChange={(e) => setHost(e.target.value)} /></div>
            <div className="space-y-1"><Label>{t('mailSettings.port')}</Label><Input type="number" dir="ltr" value={port} onChange={(e) => setPort(Number(e.target.value))} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
            {t('mailSettings.secure')}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1"><Label>{t('mailSettings.username')}</Label><Input dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>{t('mailSettings.password')}</Label>
              <Input dir="ltr" type="password" placeholder={email?.hasPassword ? '••••••••' : t('mailSettings.passwordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="text-xs text-muted-foreground">{email?.hasPassword ? t('mailSettings.hasPassword') : t('mailSettings.noPassword')}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1"><Label>{t('mailSettings.fromEmail')}</Label><Input dir="ltr" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} /></div>
            <div className="space-y-1"><Label>{t('mailSettings.fromName')}</Label><Input value={fromName} onChange={(e) => setFromName(e.target.value)} /></div>
            <div className="space-y-1"><Label>{t('mailSettings.replyTo')}</Label><Input dir="ltr" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} /></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void handleSave()}>{t('mailSettings.save')}</Button>
            <Button variant="outline" onClick={() => void handleTest()} disabled={testConnection.isPending}>
              <RefreshCw className="h-4 w-4" /> {t('mailSettings.testConnection')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('mailSettings.sendTestEmail')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label>{t('mailSettings.recipient')}</Label><Input dir="ltr" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></div>
            <div className="space-y-1"><Label>{t('mailSettings.language')}</Label>
              <Select value={testLang} onValueChange={setTestLang}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => void handleSendTest()} disabled={!testTo.trim() || sendTest.isPending}>
                <Send className="h-4 w-4" /> {t('mailSettings.sendTest')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('mailSettings.dailySummary')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={summaryEnabled} onChange={(e) => setSummaryEnabled(e.target.checked)} />
            {t('mailSettings.summaryEnabled')}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>{t('mailSettings.summaryTime')}</Label><Input type="time" dir="ltr" value={summaryTime} onChange={(e) => setSummaryTime(e.target.value)} /></div>
            <div className="space-y-1"><Label>{t('mailSettings.summaryRecipients')}</Label><Input value={summaryRecipients} onChange={(e) => setSummaryRecipients(e.target.value)} /></div>
          </div>
          <Button variant="secondary" onClick={() => void handleSaveSummary()}>{t('mailSettings.saveSummary')}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('mailSettings.failedLogs')}</CardTitle>
        </CardHeader>
        <CardContent>
          {(failedLogs?.items ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('mailSettings.noFailedLogs')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.email') ?? 'Email'}</TableHead>
                  <TableHead>{t('helpAdmin.versionDate') ?? 'When'}</TableHead>
                  <TableHead>{t('helpAdmin.status') ?? 'Status'}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(failedLogs?.items ?? []).slice(0, 10).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell dir="ltr" className="font-medium">{log.recipientEmail}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.failedAt ? new Date(log.failedAt).toLocaleString() : '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.failureCode || log.templateKey}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => void retry.mutateAsync(log.id)}>
                        {t('mailSettings.retry')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
