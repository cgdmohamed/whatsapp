import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator } from '@wa/ui';
import { ArrowRight, Settings, UserCircle, Users } from 'lucide-react';

import { useAuth } from '../lib/auth';

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return null;
  }

  const quickActions = [
    { label: t('dashboard.openUsers'), icon: Users, to: '/users', visible: user.role === 'ADMIN' || user.role === 'MANAGER' },
    { label: t('dashboard.openSettings'), icon: Settings, to: '/settings', visible: user.role === 'ADMIN' },
    { label: t('dashboard.viewProfile'), icon: UserCircle, to: '/profile', visible: true },
  ].filter((action) => action.visible);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('dashboard.welcome', { name: user.name })}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('dashboard.accountStatus')}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-6 text-sm">
          <div className="space-y-1">
            <p className="text-muted-foreground">{t('dashboard.role')}</p>
            <Badge variant="secondary">{t(`roles.${user.role}`)}</Badge>
          </div>
          <Separator orientation="vertical" className="h-10" />
          <div className="space-y-1">
            <p className="text-muted-foreground">{t('users.email')}</p>
            <p dir="ltr">{user.email}</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-base font-semibold">{t('dashboard.quickActions')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => (
            <Card key={action.to} className="cursor-pointer transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <action.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {action.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button variant="ghost" size="sm" className="px-0" onClick={() => navigate(action.to)}>
                  {t('common.open')}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">{t('common.appName')}</CardTitle>
          <CardDescription>{t('dashboard.phaseNote')}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
