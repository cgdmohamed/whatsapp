import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Spinner } from '@wa/ui';
import { CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react';

import { apiFetch } from '../lib/api';

type TokenState = 'validating' | 'valid' | 'invalid' | 'used';

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const rawToken = searchParams.get('token') ?? '';

  const [tokenState, setTokenState] = React.useState<TokenState>('validating');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    (async () => {
      if (!rawToken) {
        setTokenState('invalid');
        return;
      }
      try {
        const res = await apiFetch<{ valid: boolean }>('/auth/validate-reset-token', {
          method: 'POST',
          body: JSON.stringify({ token: rawToken }),
        });
        if (active) setTokenState(res.valid ? 'valid' : 'invalid');
      } catch {
        if (active) setTokenState('invalid');
      }
    })();
    return () => {
      active = false;
    };
  }, [rawToken]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch<{ success: true }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: rawToken, password, confirmPassword: confirm }),
      });
      setDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('USED') || message.includes('used')) setTokenState('used');
      else if (message.includes('INVALID')) setTokenState('invalid');
      else setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-primary/5 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow">
            <KeyRound className="h-6 w-6" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl">{t('auth.resetPasswordTitle')}</CardTitle>
          <CardDescription>{t('auth.resetPasswordSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {tokenState === 'validating' ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Spinner />
              <p className="text-sm text-muted-foreground">{t('auth.resetTokenValidating')}</p>
            </div>
          ) : tokenState === 'invalid' ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">{t('auth.resetPasswordInvalid')}</p>
              <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                {t('auth.requestNewResetLink')}
              </Link>
            </div>
          ) : tokenState === 'used' ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">{t('auth.resetPasswordUsed')}</p>
              <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                {t('auth.requestNewResetLink')}
              </Link>
            </div>
          ) : done ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{t('auth.resetPasswordSuccess')}</p>
              <Link to="/login" className="text-sm text-primary hover:underline">
                {t('auth.goToLogin')}
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('auth.newPassword')}</label>
                <div className="relative">
                  <Input
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="pe-10"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
                    className="absolute end-3 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground"
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('auth.confirmPassword')}</label>
                <Input
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting || !password || !confirm}>
                {submitting ? <Spinner size="sm" /> : null}
                {t('auth.resetPasswordButton')}
              </Button>
              <div className="text-center">
                <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
                  {t('auth.backToLogin')}
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
