import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  FileText,
  Inbox,
  KeyRound,
  LayoutDashboard,
  List,
  LogOut,
  Megaphone,
  PanelLeft,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
} from 'lucide-react';
import type { Role } from '@wa/shared';
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarNav,
  type SidebarNavItem,
} from '@wa/ui';

import { useAuth } from '../lib/auth';
import { initials } from '../lib/format';
import { getStoredLanguage, setLanguage, SUPPORTED_LANGUAGES, type AppLanguage } from '../lib/i18n';

const SIDEBAR_STORAGE_KEY = 'wa-sidebar-collapsed';

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = React.useState(() => localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1');
  const toggle = React.useCallback(() => {
    setCollapsed((value) => {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, value ? '0' : '1');
      return !value;
    });
  }, []);
  return { collapsed, toggle };
}

function buildNavItems(role: Role, t: (key: string) => string): SidebarNavItem[] {
  const items: SidebarNavItem[] = [
    { to: '/', label: t('nav.dashboard'), icon: LayoutDashboard, end: true },
    { to: '/contacts', label: t('nav.contacts'), icon: Users, disabled: true },
    { to: '/lists', label: t('nav.lists'), icon: List, disabled: true },
    { to: '/templates', label: t('nav.templates'), icon: FileText, disabled: true },
    { to: '/campaigns', label: t('nav.campaigns'), icon: Megaphone, disabled: true },
    { to: '/inbox', label: t('nav.inbox'), icon: Inbox, disabled: true },
    { to: '/reports', label: t('nav.reports'), icon: BarChart3, disabled: true },
  ];

  if (role === 'ADMIN' || role === 'MANAGER') {
    items.push({ to: '/users', label: t('nav.users'), icon: Users });
  }

  items.push({ to: '/profile', label: t('nav.profile'), icon: UserCircle });

  if (role === 'ADMIN') {
    items.push(
      { to: '/audit-log', label: t('nav.auditLog'), icon: ScrollText },
      { to: '/settings', label: t('nav.settings'), icon: Settings },
    );
  }

  return items;
}

export function AppShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { collapsed, toggle } = useSidebarCollapsed();

  const [language, setLanguageState] = React.useState<AppLanguage>(getStoredLanguage());

  if (!user) {
    return null;
  }

  const changeLanguage = (next: AppLanguage) => {
    void setLanguage(next);
    setLanguageState(next);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const navItems = buildNavItems(user.role, t);

  const header = (
    <div className="flex items-center gap-3 px-2 py-1">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
      </div>
      {!collapsed ? (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{t('common.appName')}</p>
        </div>
      ) : null}
    </div>
  );

  const footer = (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle sidebar">
        <PanelLeft className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-e bg-card">
        <SidebarNav
          items={navItems}
          collapsed={collapsed}
          currentPath={location.pathname}
          onNavigate={(to) => navigate(to)}
          header={header}
          footer={footer}
          className={collapsed ? 'w-16' : 'w-60'}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b bg-background/95 px-6 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t('common.appName')}</span>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <span>{t('languages.' + language)}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <DropdownMenuItem key={lang} onClick={() => changeLanguage(lang)}>
                    {t('languages.' + lang)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-40 truncate text-sm sm:inline">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <UserCircle className="h-4 w-4" />
                  {t('nav.profile')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/change-password')}>
                  <KeyRound className="h-4 w-4" />
                  {t('common.changePassword')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void handleLogout()}>
                  <LogOut className="h-4 w-4" />
                  {t('common.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
